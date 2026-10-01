import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["RUNNING", "COMPLETED", "FAILED"],
      default: "RUNNING",
    },
    summary: String,
    suspectedCauses: [
      { _id: false, cause: String, reasoning: String, evidenceIds: [String] },
    ],
    affectedServices: [String],
    nextSteps: [String],
    evidenceSufficiency: {
      type: String,
      enum: ["SUFFICIENT", "PARTIAL", "INSUFFICIENT"],
    },
    retrievedEvidence: [mongoose.Schema.Types.Mixed],
    modelInformation: mongoose.Schema.Types.Mixed,
    failureMessage: String,
  },
  { timestamps: true },
);
schema.index(
  { incidentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "RUNNING" },
    name: "one_running_investigation",
  },
);
export const Investigation = mongoose.model("Investigation", schema);
