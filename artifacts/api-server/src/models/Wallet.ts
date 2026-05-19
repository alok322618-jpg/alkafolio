import mongoose, { type Document, Schema } from "mongoose";

export type ChainType = "solana" | "ethereum" | "ton";

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId;
  address: string;
  chain: ChainType;
  label: string;
  createdAt: Date;
}

const WalletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    address: { type: String, required: true, trim: true },
    chain: { type: String, enum: ["solana", "ethereum", "ton"], required: true },
    label: { type: String, default: "" },
  },
  { timestamps: true },
);

WalletSchema.index({ userId: 1, address: 1, chain: 1 }, { unique: true });

export const Wallet = mongoose.model<IWallet>("Wallet", WalletSchema);
