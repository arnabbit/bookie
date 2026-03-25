export interface Page {
    id: number;
    summary: string;
    originalText?: string;
}

export interface Chapter {
    id: number;
    title: string;
    summary: string; // Chapter summary displayed in ChapterView
    pages: Page[];   // Detailed pages for page-by-page reading
    likes: number;
    bookmarks: number;
}

export interface Book {
    id: number;
    title: string;
    author: string;
    reads: string;
    coverColor: string;
    quote: string;
    tags: string[];
    chapters: Chapter[];
    mode?: 'summary' | 'page-by-page';
}
