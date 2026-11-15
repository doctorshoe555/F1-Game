export type QuestionType = 'mc' | 'tf' | 'estimate' | 'image' | 'order';

export interface QuestionImage { url: string; license: string; author: string; source: string }

/** Eine Frage, wie sie in data/questions/**.json steht (siehe data/schema/question.schema.json). */
export interface Question {
  id: string;
  type: QuestionType;
  category: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  year?: number;
  tags: string[];
  question: string;
  image?: QuestionImage;
  options?: string[];
  items?: string[];
  answer?: number | boolean;
  accept?: string[];
  tolerance?: number;
  unit?: string;
  explanation: string;
  source: string;
  generated: boolean;
  validFrom?: string;
  validUntil?: string;
  lastVerified: string;
}

export interface Category { id: string; title: string; emoji: string }

/** Eine für eine Runde „ausgeteilte“ Frage: Optionen/Elemente sind gemischt. */
export interface Dealt {
  q: Question;
  /** mc/image: Optionen in Anzeige-Reihenfolge · order: gemischte Elemente */
  shown: string[];
  /** mc/image: Index der richtigen Option in `shown` */
  correctIndex: number;
}

/** Antwort eines Spielers; null = Zeit abgelaufen. */
export type Answer = { kind: 'choice'; index: number } | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number } | { kind: 'order'; items: string[] } | null;

export type LevelId = 'sonntagsfahrer' | 'stammgast' | 'profi' | 'bwoah';
export type EraId = 'alle' | 'ab2000' | 'ab2014' | 'vor2000';

export interface PoolFilter { level: LevelId; categories: string[] | null; era: EraId }
