import mongoose, { type Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  isVerified: boolean;
  otp: string | null;
  otpExpiry: Date | null;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", UserSchema);
