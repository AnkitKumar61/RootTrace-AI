import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ["RUNNING", "COMPLETED", "PARTIAL", "FAILED"],
      default: "RUNNING",
    },
    topK: Number,
    includeReports: Boolean,
    result: mongoose.Schema.Types.Mixed,
    failureMessage: String,
  },
  { timestamps: true },
);
schema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "RUNNING" },
    name: "one_running_evaluation",
  },
);
export const EvaluationRun = mongoose.model("EvaluationRun", schema);
