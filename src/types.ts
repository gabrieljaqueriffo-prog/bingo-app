export type Cell = number | null;
export type Card = { id: string; gameId: string; label: string; tableNumber?: number; sourceImageId?: string; rows: Cell[][]; confidence?: number };
export type Modality = { name: string; cells: number[]; status: "active" | "completed"; endedAt?: string };
export type Game = { id: string; name: string; createdAt: string; updatedAt: string; status: "active" | "archived"; calledNumbers: number[]; history: number[]; cards: Card[]; modality?: Modality };
export type ParsedCard = { id: string; rows: Cell[][]; confidence: number; tableNumber?: number };
export type ParseResult = { sourceImageId: string; cards: ParsedCard[]; tableNumber?: number; warnings: string[] };
export interface CardImageParser { parse(file: File, onProgress?: (value: number) => void): Promise<ParseResult> }
