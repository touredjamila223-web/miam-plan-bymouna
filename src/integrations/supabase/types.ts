export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appliances: {
        Row: {
          appliance: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          appliance: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          appliance?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          thread_id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      collection_recipes: {
        Row: {
          collection_id: string
          created_at: string | null
          recipe_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string | null
          recipe_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string | null
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_recipes_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      cooked_history: {
        Row: {
          comment: string | null
          cooked_at: string | null
          ease_rating: number | null
          family_loved: boolean | null
          id: string
          recipe_id: string
          taste_rating: number | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          cooked_at?: string | null
          ease_rating?: number | null
          family_loved?: boolean | null
          id?: string
          recipe_id: string
          taste_rating?: number | null
          user_id: string
        }
        Update: {
          comment?: string | null
          cooked_at?: string | null
          ease_rating?: number | null
          family_loved?: boolean | null
          id?: string
          recipe_id?: string
          taste_rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooked_history_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      dietary_preferences: {
        Row: {
          created_at: string | null
          id: string
          restriction: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          restriction: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          restriction?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string | null
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      fridge_items: {
        Row: {
          created_at: string | null
          id: string
          name: string
          qty: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          qty?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          qty?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meal_plan: {
        Row: {
          created_at: string | null
          date: string
          id: string
          recipe_id: string | null
          servings: number | null
          slot: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          recipe_id?: string | null
          servings?: number | null
          slot: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          recipe_id?: string | null
          servings?: number | null
          slot?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          family_name: string | null
          household_size: number | null
          id: string
          onboarded: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          family_name?: string | null
          household_size?: number | null
          id: string
          onboarded?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          family_name?: string | null
          household_size?: number | null
          id?: string
          onboarded?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recipes: {
        Row: {
          appliance: string | null
          created_at: string | null
          cuisine_style: string | null
          description: string | null
          difficulty: string | null
          id: string
          ingredients: Json
          owner_id: string | null
          photo_url: string | null
          prep_time: number | null
          servings: number | null
          source: string | null
          steps: Json
          title: string
        }
        Insert: {
          appliance?: string | null
          created_at?: string | null
          cuisine_style?: string | null
          description?: string | null
          difficulty?: string | null
          id?: string
          ingredients?: Json
          owner_id?: string | null
          photo_url?: string | null
          prep_time?: number | null
          servings?: number | null
          source?: string | null
          steps?: Json
          title: string
        }
        Update: {
          appliance?: string | null
          created_at?: string | null
          cuisine_style?: string | null
          description?: string | null
          difficulty?: string | null
          id?: string
          ingredients?: Json
          owner_id?: string | null
          photo_url?: string | null
          prep_time?: number | null
          servings?: number | null
          source?: string | null
          steps?: Json
          title?: string
        }
        Relationships: []
      }
      shopping_list: {
        Row: {
          category: string | null
          checked: boolean | null
          created_at: string | null
          id: string
          item: string
          qty: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          checked?: boolean | null
          created_at?: string | null
          id?: string
          item: string
          qty?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          checked?: boolean | null
          created_at?: string | null
          id?: string
          item?: string
          qty?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
