// Auto-generate this file by running:
// npx supabase gen types typescript --project-id <your-project-id> > types/database.types.ts
//
// Hand-crafted version based on your schema — replace with generated output.

export type Database = {
    public: {
      Tables: {
        profiles: {
          Row: {
            id: string;
            username: string | null;
            avatar_url: string | null;
            created_at: string;
          };
          Insert: {
            id: string;
            username?: string | null;
            avatar_url?: string | null;
            created_at?: string;
          };
          Update: {
            id?: string;
            username?: string | null;
            avatar_url?: string | null;
            created_at?: string;
          };
          Relationships: [];
        };
        groups: {
          Row: {
            id: string;
            name: string;
            admin_id: string | null;
            invite_code: string;
            created_at: string;
          };
          Insert: {
            id?: string;
            name: string;
            admin_id?: string | null;
            invite_code: string;
            created_at?: string;
          };
          Update: {
            id?: string;
            name?: string;
            admin_id?: string | null;
            invite_code?: string;
            created_at?: string;
          };
          Relationships: [];
        };
        memberships: {
          Row: { user_id: string; group_id: string };
          Insert: { user_id: string; group_id: string };
          Update: { user_id?: string; group_id?: string };
          Relationships: [];
        };
        books: {
          Row: {
            id: string;
            group_id: string;
            title: string;
            author: string | null;
            total_chapters: number | null;
            created_at: string;
          };
          Insert: {
            id?: string;
            group_id: string;
            title: string;
            author?: string | null;
            total_chapters?: number | null;
            created_at?: string;
          };
          Update: {
            id?: string;
            group_id?: string;
            title?: string;
            author?: string | null;
            total_chapters?: number | null;
            created_at?: string;
          };
          Relationships: [];
        };
        user_book_progress: {
          Row: {
            user_id: string;
            book_id: string;
            current_chapter: number;
            updated_at: string;
          };
          Insert: {
            user_id: string;
            book_id: string;
            current_chapter?: number;
            updated_at?: string;
          };
          Update: {
            user_id?: string;
            book_id?: string;
            current_chapter?: number;
            updated_at?: string;
          };
          Relationships: [];
        };
        discussions: {
          Row: {
            id: string;
            group_id: string;
            book_id: string | null;
            sender_id: string | null;
            content: string;
            created_at: string;
          };
          Insert: {
            id?: string;
            group_id: string;
            book_id?: string | null;
            sender_id?: string | null;
            content: string;
            created_at?: string;
          };
          Update: {
            id?: string;
            group_id?: string;
            book_id?: string | null;
            sender_id?: string | null;
            content?: string;
            created_at?: string;
          };
          Relationships: [];
        };
        private_chat_rooms: {
          Row: {
            id: string;
            book_id: string;
            group_name: string | null;
            created_at: string;
          };
          Insert: {
            id?: string;
            book_id: string;
            group_name?: string | null;
            created_at?: string;
          };
          Update: {
            id?: string;
            book_id?: string;
            group_name?: string | null;
            created_at?: string;
          };
          Relationships: [];
        };
        private_chat_members: {
          Row: { room_id: string; user_id: string };
          Insert: { room_id: string; user_id: string };
          Update: { room_id?: string; user_id?: string };
          Relationships: [];
        };
        private_messages: {
          Row: {
            id: string;
            room_id: string;
            sender_id: string | null;
            content: string;
            created_at: string;
          };
          Insert: {
            id?: string;
            room_id: string;
            sender_id?: string | null;
            content: string;
            created_at?: string;
          };
          Update: {
            id?: string;
            room_id?: string;
            sender_id?: string | null;
            content?: string;
            created_at?: string;
          };
          Relationships: [];
        };
      };
      Views: Record<string, never>;
      Functions: Record<string, never>;
      Enums: Record<string, never>;
    };
  };