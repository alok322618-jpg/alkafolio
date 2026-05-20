import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    address: { type: String, required: true, trim: true },
    chain: { type: String, enum: ['solana', 'ethereum', 'ton'], required: true },
    label: { type: String, default: '' },
  },
  { timestamps: true }
);

WalletSchema.index({ userId: 1, address: 1, chain: 1 }, { unique: true });

export const Wallet = mongoose.model('Wallet', WalletSchema);
