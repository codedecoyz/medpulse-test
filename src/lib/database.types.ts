export type UserRole =
  | 'admin'
  | 'store_manager'
  | 'pharmacist'
  | 'nurse'
  | 'coordinator'
  | 'auditor';

export type LocationType =
  | 'central_store'
  | 'pharmacy'
  | 'er'
  | 'icu'
  | 'ot'
  | 'ward'
  | 'blood_bank';

export type StockCondition = 'usable' | 'damaged' | 'expired' | 'quarantined';

export type MovementType =
  | 'receive'
  | 'issue'
  | 'transfer'
  | 'return'
  | 'wastage'
  | 'adjustment'
  | 'count_adjustment';

export type Criticality = 'A' | 'B' | 'C';

export type AppLocale = 'en' | 'hi';

export type LocationRow = Database['public']['Tables']['locations']['Row'];

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      hospitals: {
        Row: {
          id: string;
          name: string;
          code: string;
          idle_timeout_minutes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          idle_timeout_minutes?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          idle_timeout_minutes?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          hospital_id: string;
          parent_id: string | null;
          name: string;
          type: LocationType;
          created_at: string;
        };
        Insert: {
          id?: string;
          hospital_id: string;
          parent_id?: string | null;
          name: string;
          type: LocationType;
          created_at?: string;
        };
        Update: {
          id?: string;
          hospital_id?: string;
          parent_id?: string | null;
          name?: string;
          type?: LocationType;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          hospital_id: string;
          full_name: string;
          role: UserRole;
          locale: AppLocale;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          hospital_id: string;
          full_name: string;
          role: UserRole;
          locale?: AppLocale;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          hospital_id?: string;
          full_name?: string;
          role?: UserRole;
          locale?: AppLocale;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_locations: {
        Row: {
          user_id: string;
          location_id: string;
          hospital_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          location_id: string;
          hospital_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          location_id?: string;
          hospital_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          id: string;
          key: string;
          hospital_id: string;
          user_id: string | null;
          enabled: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          hospital_id: string;
          user_id?: string | null;
          enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          hospital_id?: string;
          user_id?: string | null;
          enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          hospital_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_data: Json | null;
          after_data: Json | null;
          metadata: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          hospital_id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          hospital_id: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          hospital_id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          hospital_id: string;
          name: string;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
          lead_time_days: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          hospital_id: string;
          name: string;
          contact_name?: string | null;
          phone?: string | null;
          email?: string | null;
          lead_time_days?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          hospital_id?: string;
          name?: string;
          contact_name?: string | null;
          phone?: string | null;
          email?: string | null;
          lead_time_days?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          hospital_id: string;
          sku: string;
          name: string;
          category_id: string | null;
          base_unit: string;
          barcode: string | null;
          criticality: Criticality;
          is_controlled: boolean;
          is_cold_chain: boolean;
          tracks_batch: boolean;
          tracks_expiry: boolean;
          unit_cost: number;
          supplier_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          hospital_id: string;
          sku: string;
          name: string;
          category_id?: string | null;
          base_unit: string;
          barcode?: string | null;
          criticality?: Criticality;
          is_controlled?: boolean;
          is_cold_chain?: boolean;
          tracks_batch?: boolean;
          tracks_expiry?: boolean;
          unit_cost?: number;
          supplier_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          hospital_id?: string;
          sku?: string;
          name?: string;
          category_id?: string | null;
          base_unit?: string;
          barcode?: string | null;
          criticality?: Criticality;
          is_controlled?: boolean;
          is_cold_chain?: boolean;
          tracks_batch?: boolean;
          tracks_expiry?: boolean;
          unit_cost?: number;
          supplier_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_units: {
        Row: {
          item_id: string;
          hospital_id: string;
          unit: string;
          factor_to_base: number;
          is_order_pack: boolean;
        };
        Insert: {
          item_id: string;
          hospital_id: string;
          unit: string;
          factor_to_base: number;
          is_order_pack?: boolean;
        };
        Update: {
          item_id?: string;
          hospital_id?: string;
          unit?: string;
          factor_to_base?: number;
          is_order_pack?: boolean;
        };
        Relationships: [];
      };
      batches: {
        Row: {
          id: string;
          hospital_id: string;
          item_id: string;
          batch_no: string;
          expiry_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          hospital_id: string;
          item_id: string;
          batch_no: string;
          expiry_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          hospital_id?: string;
          item_id?: string;
          batch_no?: string;
          expiry_date?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      par_levels: {
        Row: {
          item_id: string;
          location_id: string;
          hospital_id: string;
          min_qty: number;
          par_qty: number;
          max_qty: number;
        };
        Insert: {
          item_id: string;
          location_id: string;
          hospital_id: string;
          min_qty: number;
          par_qty: number;
          max_qty: number;
        };
        Update: {
          item_id?: string;
          location_id?: string;
          hospital_id?: string;
          min_qty?: number;
          par_qty?: number;
          max_qty?: number;
        };
        Relationships: [];
      };
      count_reason_codes: {
        Row: {
          code: string;
          label_en: string;
          label_hi: string | null;
          requires_note: boolean;
          is_active: boolean;
        };
        Insert: {
          code: string;
          label_en: string;
          label_hi?: string | null;
          requires_note?: boolean;
          is_active?: boolean;
        };
        Update: {
          code?: string;
          label_en?: string;
          label_hi?: string | null;
          requires_note?: boolean;
          is_active?: boolean;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          hospital_id: string;
          item_id: string;
          batch_id: string | null;
          from_location_id: string | null;
          to_location_id: string | null;
          condition: StockCondition;
          qty: number;
          type: MovementType;
          reason_code: string | null;
          note: string | null;
          ref_type: string | null;
          ref_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          hospital_id: string;
          item_id: string;
          batch_id?: string | null;
          from_location_id?: string | null;
          to_location_id?: string | null;
          condition?: StockCondition;
          qty: number;
          type: MovementType;
          reason_code?: string | null;
          note?: string | null;
          ref_type?: string | null;
          ref_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      stock_levels: {
        Row: {
          id: string;
          hospital_id: string;
          item_id: string;
          batch_id: string | null;
          location_id: string;
          condition: StockCondition;
          qty: number;
          reserved_qty: number;
          last_counted_at: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_auth_event: {
        Args: {
          p_action: 'auth.sign_in' | 'auth.sign_out' | 'auth.reauth';
          p_metadata?: Json;
        };
        Returns: string;
      };
      submit_stock_movement: {
        Args: {
          p_id: string;
          p_item_id: string;
          p_type: MovementType;
          p_qty: number;
          p_condition?: StockCondition;
          p_from_location_id?: string | null;
          p_to_location_id?: string | null;
          p_batch_id?: string | null;
          p_batch_no?: string | null;
          p_expiry_date?: string | null;
          p_reason_code?: string | null;
          p_note?: string | null;
          p_ref_type?: string | null;
          p_ref_id?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      stock_condition: StockCondition;
      movement_type: MovementType;
    };
    CompositeTypes: Record<string, never>;
  };
}
