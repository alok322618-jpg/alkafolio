import mongoose from 'mongoose';

// One row per user per day: total portfolio value in USD at the time
// balances were last fetched. Powers the real portfolio-history chart.
const SnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (UTC)
    totalUsd: { type: Number, required: true },
  },
  { timestamps: true }
);

SnapshotSchema.index({ userId: 1, date: 1 }, { unique: true });

export const Snapshot = mongoose.model('Snapshot', SnapshotSchema);
