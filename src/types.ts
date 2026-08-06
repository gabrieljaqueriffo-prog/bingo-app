export type Cell = number | null;
export type Card = { id: string; gameId: string; label: string; sourceImageId?: string; rows: Cell[][]; confidence?: number };
export type Game = { id: string; name: string; createdAt: string; updatedAt: string; status: "active" | "archived"; calledNumbers: number[]; history: number[]; cards: Card[] };
export type ParsedCard = { id: string; rows: Cell[][]; confidence: number };
export type ParseResult = { sourceImageId: string; cards: ParsedCard[]; warnings: string[] };
export interface CardImageParser { parse(file: File, onProgress?: (value: number) => void): Promise<ParseResult> }
