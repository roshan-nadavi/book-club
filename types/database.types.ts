// Auto-generate this file by running:
// npx supabase gen types typescript --project-id <your-project-id> > types/database.types.ts

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
          // profiles.id references auth.users — auth schema is external, omitted by convention
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
          Relationships: [
            {
              foreignKeyName: "groups_admin_id_fkey";
              columns: ["admin_id"];
              referencedRelation: "profiles";
              referencedColumns: ["id"];
            }
          ];
        };
  
        memberships: {
          Row: { user_id: string; group_id: string };
          Insert: { user_id: string; group_id: string };
          Update: { user_id?: string; group_id?: string };
          Relationships: [
            {
              foreignKeyName: "memberships_user_id_fkey";
              columns: ["user_id"];
              referencedRelation: "profiles";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "memberships_group_id_fkey";
              columns: ["group_id"];
              referencedRelation: "groups";
              referencedColumns: ["id"];
            }
          ];
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
          Relationships: [
            {
              foreignKeyName: "books_group_id_fkey";
              columns: ["group_id"];
              referencedRelation: "groups";
              referencedColumns: ["id"];
            }
          ];
        };
  
        user_book_progress: {
          Row: {
            user_id: string;
            book_id: string;
            // DECIMAL(5,1) in Postgres — number covers both integer and decimal chapters
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
          Relationships: [
            {
              foreignKeyName: "user_book_progress_user_id_fkey";
              columns: ["user_id"];
              referencedRelation: "profiles";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "user_book_progress_book_id_fkey";
              columns: ["book_id"];
              referencedRelation: "books";
              referencedColumns: ["id"];
            }
          ];
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
          Relationships: [
            {
              foreignKeyName: "discussions_group_id_fkey";
              columns: ["group_id"];
              referencedRelation: "groups";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "discussions_book_id_fkey";
              columns: ["book_id"];
              referencedRelation: "books";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "discussions_sender_id_fkey";
              columns: ["sender_id"];
              referencedRelation: "profiles";
              referencedColumns: ["id"];
            }
          ];
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
          Relationships: [
            {
              foreignKeyName: "private_chat_rooms_book_id_fkey";
              columns: ["book_id"];
              referencedRelation: "books";
              referencedColumns: ["id"];
            }
          ];
        };
  
        private_chat_members: {
          Row: { room_id: string; user_id: string };
          Insert: { room_id: string; user_id: string };
          Update: { room_id?: string; user_id?: string };
          Relationships: [
            {
              foreignKeyName: "private_chat_members_room_id_fkey";
              columns: ["room_id"];
              referencedRelation: "private_chat_rooms";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "private_chat_members_user_id_fkey";
              columns: ["user_id"];
              referencedRelation: "profiles";
              referencedColumns: ["id"];
            }
          ];
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
          Relationships: [
            {
              foreignKeyName: "private_messages_room_id_fkey";
              columns: ["room_id"];
              referencedRelation: "private_chat_rooms";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "private_messages_sender_id_fkey";
              columns: ["sender_id"];
              referencedRelation: "profiles";
              referencedColumns: ["id"];
            }
          ];
        };
      };
      Views: Record<string, never>;
      Functions: Record<string, never>;
      Enums: Record<string, never>;
    };
  };