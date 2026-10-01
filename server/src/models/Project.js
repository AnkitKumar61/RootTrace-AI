import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["ACTIVE", "DELETING"], default: "ACTIVE" },
    cleanupError: { type: String, default: "" },
    cleanupSteps: { type: [String], default: [] },
  },
  { timestamps: true },
);
export const Project = mongoose.model("Project", schema);
