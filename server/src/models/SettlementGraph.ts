import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISettlementGraphVertex {
  userId: string;
}

export interface ISettlementGraphEdge {
  edgeId: string;
  fromUserId: string;
  toUserId: string;
  amountPaise: number;
  currency: 'INR';
}

export interface ISettlementGraph extends Document {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  vertices: ISettlementGraphVertex[];
  edges: ISettlementGraphEdge[];
  createdAt: Date;
  updatedAt: Date;
}

const SettlementGraphVertexSchema = new Schema<ISettlementGraphVertex>(
  {
    userId: { type: String, required: true },
  },
  { _id: false }
);

const SettlementGraphEdgeSchema = new Schema<ISettlementGraphEdge>(
  {
    edgeId: { type: String, required: true },
    fromUserId: { type: String, required: true },
    toUserId: { type: String, required: true },
    amountPaise: { type: Number, required: true, min: 0, max: 9999999999 },
    currency: { type: String, enum: ['INR'], default: 'INR' },
  },
  { _id: false }
);

const SettlementGraphSchema = new Schema<ISettlementGraph>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, unique: true, index: true },
    vertices: { type: [SettlementGraphVertexSchema], required: true, default: [] },
    edges: { type: [SettlementGraphEdgeSchema], required: true, default: [] },
  },
  { timestamps: true }
);

export const SettlementGraph = mongoose.model<ISettlementGraph>('SettlementGraph', SettlementGraphSchema);
