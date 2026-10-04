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
      alerts: {
        Row: {
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          restaurant_id: string
          session_id: string | null
          table_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          restaurant_id: string
          session_id?: string | null
          table_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          restaurant_id?: string
          session_id?: string | null
          table_id?: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_session_id_restaurant_id_fkey"
            columns: ["session_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "alerts_table_id_restaurant_id_fkey"
            columns: ["table_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      categories: {
        Row: {
          emoji: string | null
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          emoji?: string | null
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          emoji?: string | null
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string
          created_at: string
          description: string
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price: number
          restaurant_id: string
          sold_out_until: string | null
          sort_order: number
          tags: string[]
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price: number
          restaurant_id: string
          sold_out_until?: string | null
          sort_order?: number
          tags?: string[]
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price?: number
          restaurant_id?: string
          sold_out_until?: string | null
          sort_order?: number
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
            columns: ["category_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      option_groups: {
        Row: {
          id: string
          max_select: number | null
          menu_item_id: string
          min_select: number
          name: string
          required: boolean
          restaurant_id: string
          selection: Database["public"]["Enums"]["option_selection"]
          sort_order: number
        }
        Insert: {
          id?: string
          max_select?: number | null
          menu_item_id: string
          min_select?: number
          name: string
          required?: boolean
          restaurant_id: string
          selection?: Database["public"]["Enums"]["option_selection"]
          sort_order?: number
        }
        Update: {
          id?: string
          max_select?: number | null
          menu_item_id?: string
          min_select?: number
          name?: string
          required?: boolean
          restaurant_id?: string
          selection?: Database["public"]["Enums"]["option_selection"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_menu_item_id_restaurant_id_fkey"
            columns: ["menu_item_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "option_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          group_id: string
          id: string
          is_available: boolean
          name: string
          price_delta: number
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          group_id: string
          id?: string
          is_available?: boolean
          name: string
          price_delta?: number
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_available?: boolean
          name?: string
          price_delta?: number
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "options_group_id_restaurant_id_fkey"
            columns: ["group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          line_total: number | null
          menu_item_id: string | null
          name_snapshot: string
          notes: string
          order_id: string
          qty: number
          restaurant_id: string
          selected_options: Json
          sort_order: number
          unit_price_snapshot: number
        }
        Insert: {
          id?: string
          line_total?: number | null
          menu_item_id?: string | null
          name_snapshot: string
          notes?: string
          order_id: string
          qty: number
          restaurant_id: string
          selected_options?: Json
          sort_order?: number
          unit_price_snapshot: number
        }
        Update: {
          id?: string
          line_total?: number | null
          menu_item_id?: string | null
          name_snapshot?: string
          notes?: string
          order_id?: string
          qty?: number
          restaurant_id?: string
          selected_options?: Json
          sort_order?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_restaurant_id_fkey"
            columns: ["order_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          delivered_at: string | null
          handled_by: string | null
          id: string
          ready_at: string | null
          restaurant_id: string
          sent_to_kitchen_at: string | null
          session_id: string
          status: Database["public"]["Enums"]["order_status"]
          table_id: string
          total: number
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          handled_by?: string | null
          id?: string
          ready_at?: string | null
          restaurant_id: string
          sent_to_kitchen_at?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id: string
          total?: number
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          handled_by?: string | null
          id?: string
          ready_at?: string | null
          restaurant_id?: string
          sent_to_kitchen_at?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_restaurant_id_fkey"
            columns: ["session_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "orders_table_id_restaurant_id_fkey"
            columns: ["table_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_demo: boolean
          locale: string
          logo_url: string | null
          name: string
          slug: string
          tagline: string | null
          theme: Json
          timezone: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_demo?: boolean
          locale?: string
          logo_url?: string | null
          name: string
          slug: string
          tagline?: string | null
          theme?: Json
          timezone?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_demo?: boolean
          locale?: string
          logo_url?: string | null
          name?: string
          slug?: string
          tagline?: string | null
          theme?: Json
          timezone?: string
        }
        Relationships: []
      }
      sectors: {
        Row: {
          id: string
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          is_active?: boolean
          restaurant_id: string
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: [
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          restaurant_id: string
          role?: Database["public"]["Enums"]["staff_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          restaurant_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          id: string
          opened_at: string
          restaurant_id: string
          status: Database["public"]["Enums"]["session_status"]
          table_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["session_status"]
          table_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["session_status"]
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_restaurant_id_fkey"
            columns: ["table_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      tables: {
        Row: {
          id: string
          is_active: boolean
          label: string | null
          number: number
          restaurant_id: string
          sector_id: string | null
          token: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          label?: string | null
          number: number
          restaurant_id: string
          sector_id?: string | null
          token?: string
        }
        Update: {
          id?: string
          is_active?: boolean
          label?: string | null
          number?: number
          restaurant_id?: string
          sector_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_sector_id_restaurant_id_fkey"
            columns: ["sector_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      waiter_assignments: {
        Row: {
          id: string
          restaurant_id: string
          sector_id: string | null
          staff_id: string
          table_id: string | null
        }
        Insert: {
          id?: string
          restaurant_id: string
          sector_id?: string | null
          staff_id: string
          table_id?: string | null
        }
        Update: {
          id?: string
          restaurant_id?: string
          sector_id?: string | null
          staff_id?: string
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiter_assignments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_assignments_sector_id_restaurant_id_fkey"
            columns: ["sector_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "waiter_assignments_staff_id_restaurant_id_fkey"
            columns: ["staff_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "waiter_assignments_table_id_restaurant_id_fkey"
            columns: ["table_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage: { Args: { p_restaurant_id: string }; Returns: boolean }
      can_operate: { Args: { p_restaurant_id: string }; Returns: boolean }
      close_table_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      create_alert: {
        Args: {
          p_token: string
          p_type: Database["public"]["Enums"]["alert_type"]
        }
        Returns: Json
      }
      create_restaurant: {
        Args: { p_name: string; p_slug: string }
        Returns: Json
      }
      current_restaurant_id: { Args: never; Returns: string }
      current_staff_role: {
        Args: never
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      demo_uuid: { Args: { p_block: number; p_n: number }; Returns: string }
      ensure_open_session: {
        Args: { p_restaurant_id: string; p_table_id: string }
        Returns: string
      }
      get_session_state: { Args: { p_session_id: string }; Returns: Json }
      get_table_by_token: { Args: { p_token: string }; Returns: Json }
      get_tables_overview: { Args: { p_restaurant_id: string }; Returns: Json }
      is_manager: { Args: never; Returns: boolean }
      join_restaurant: {
        Args: { p_code: string; p_display_name?: string }
        Returns: Json
      }
      place_order: { Args: { p_items: Json; p_token: string }; Returns: Json }
      random_code: {
        Args: { alphabet?: string; len?: number }
        Returns: string
      }
      reset_demo: { Args: never; Returns: undefined }
      seed_demo: { Args: never; Returns: undefined }
      set_item_sold_out: {
        Args: { p_menu_item_id: string; p_sold_out: boolean }
        Returns: string
      }
    }
    Enums: {
      alert_type: "waiter" | "bill"
      option_selection: "single" | "multiple"
      order_status: "pending" | "kitchen" | "ready" | "delivered" | "cancelled"
      session_status: "open" | "bill_requested" | "closed"
      staff_role: "owner" | "admin" | "waiter" | "kitchen"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_type: ["waiter", "bill"],
      option_selection: ["single", "multiple"],
      order_status: ["pending", "kitchen", "ready", "delivered", "cancelled"],
      session_status: ["open", "bill_requested", "closed"],
      staff_role: ["owner", "admin", "waiter", "kitchen"],
    },
  },
} as const
