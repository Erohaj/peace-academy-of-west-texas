/**
 * Types for the PAWTX Supabase schema.
 *
 * Hand-written to mirror supabase/migrations/*.sql. Once the Supabase CLI is
 * installed locally, regenerate instead of editing by hand:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * These describe the raw snake_case database shape. The camelCase types the
 * components use live in src/types/index.ts; src/lib/api/* maps between them.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type EventCategoryRow = 'cooking' | 'cultural' | 'seminars' | 'relief';
export type EventStatusRow = 'upcoming' | 'ongoing' | 'past';
export type VolunteerRoleRow =
  | 'Food Prep'
  | 'Event Setup'
  | 'Greeter'
  | 'Translator'
  | 'Distribution'
  | 'General Support';
export type DonationFrequencyRow = 'one_time' | 'monthly';
export type DonationStatusRow = 'pending' | 'paid' | 'failed' | 'refunded';
export type ProfileRoleRow = 'volunteer' | 'admin';
export type AttendanceRow = 'attended' | 'no_show';
export type ServiceSourceRow = 'shift' | 'manual';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: ProfileRoleRow;
          badges: string[];
          joined_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          badges?: string[];
          joined_at?: string;
        };
        // `role` is deliberately absent: the column is revoked from the
        // `authenticated` role so clients cannot promote themselves to admin.
        Update: {
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };

      events: {
        Row: {
          id: string;
          title: string;
          title_es: string;
          description: string;
          description_es: string;
          starts_at: string;
          ends_at: string | null;
          location: string;
          category: EventCategoryRow;
          total_spots: number;
          reserved_spots: number;
          image_key: string | null;
          image_url: string | null;
          status: EventStatusRow;
          featured: boolean;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          title_es: string;
          description: string;
          description_es: string;
          starts_at: string;
          ends_at?: string | null;
          location: string;
          category: EventCategoryRow;
          total_spots: number;
          image_key?: string | null;
          image_url?: string | null;
          status?: EventStatusRow;
          featured?: boolean;
          published?: boolean;
        };
        // `reserved_spots` is revoked from `authenticated` — only create_rsvp()
        // may change it — so it is not updatable from the admin panel either.
        Update: {
          title?: string;
          title_es?: string;
          description?: string;
          description_es?: string;
          starts_at?: string;
          ends_at?: string | null;
          location?: string;
          category?: EventCategoryRow;
          total_spots?: number;
          image_key?: string | null;
          image_url?: string | null;
          status?: EventStatusRow;
          featured?: boolean;
          published?: boolean;
        };
        Relationships: [];
      };

      rsvps: {
        Row: {
          id: string;
          event_id: string;
          full_name: string;
          email: string;
          phone: string | null;
          guest_count: number;
          optional_donation: number;
          created_at: string;
        };
        // Direct inserts are revoked; RSVPs are created through create_rsvp().
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'rsvps_event_id_fkey';
            columns: ['event_id'];
            referencedRelation: 'events';
            referencedColumns: ['id'];
          }
        ];
      };

      gallery_items: {
        Row: {
          id: string;
          title: string;
          title_es: string;
          caption: string;
          caption_es: string;
          category: EventCategoryRow;
          image_key: string | null;
          image_url: string | null;
          taken_on: string;
          location: string;
          published: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          title_es: string;
          caption: string;
          caption_es: string;
          category: EventCategoryRow;
          image_key?: string | null;
          image_url?: string | null;
          taken_on: string;
          location: string;
          published?: boolean;
          sort_order?: number;
        };
        Update: {
          title?: string;
          title_es?: string;
          caption?: string;
          caption_es?: string;
          category?: EventCategoryRow;
          image_key?: string | null;
          image_url?: string | null;
          taken_on?: string;
          location?: string;
          published?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };

      shifts: {
        Row: {
          id: string;
          event_id: string | null;
          title: string;
          title_es: string;
          description: string;
          description_es: string;
          role: VolunteerRoleRow;
          role_es: string;
          starts_at: string;
          ends_at: string;
          /** Generated column: (ends_at - starts_at) in hours. Read-only. */
          duration_hours: number;
          spots_total: number;
          spots_filled: number;
          published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id?: string | null;
          title: string;
          title_es: string;
          description: string;
          description_es: string;
          role: VolunteerRoleRow;
          role_es: string;
          starts_at: string;
          ends_at: string;
          spots_total: number;
          published?: boolean;
        };
        // `spots_filled` is maintained by the shift_signups trigger.
        Update: {
          event_id?: string | null;
          title?: string;
          title_es?: string;
          description?: string;
          description_es?: string;
          role?: VolunteerRoleRow;
          role_es?: string;
          starts_at?: string;
          ends_at?: string;
          spots_total?: number;
          published?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'shifts_event_id_fkey';
            columns: ['event_id'];
            referencedRelation: 'events';
            referencedColumns: ['id'];
          }
        ];
      };

      shift_signups: {
        Row: {
          id: string;
          shift_id: string;
          user_id: string;
          attendance: AttendanceRow | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shift_id: string;
          user_id: string;
        };
        // Admins only — closing a roster. Volunteers have no update policy on
        // this table, so an update from one is refused by RLS.
        Update: {
          attendance?: AttendanceRow | null;
        };
        Relationships: [
          {
            foreignKeyName: 'shift_signups_shift_id_fkey';
            columns: ['shift_id'];
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_signups_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      service_log: {
        Row: {
          id: string;
          user_id: string;
          shift_id: string | null;
          source: ServiceSourceRow;
          hours: number;
          served_on: string;
          note: string | null;
          verified_by: string;
          verified_at: string;
          created_at: string;
        };
        // Admins only. `verified_by` is required by the WITH CHECK, which also
        // demands it equal auth.uid() — an admin credits anyone, but only ever
        // under their own name.
        Insert: {
          id?: string;
          user_id: string;
          shift_id?: string | null;
          source: ServiceSourceRow;
          hours: number;
          served_on: string;
          note?: string | null;
          verified_by: string;
        };
        Update: {
          hours?: number;
          served_on?: string;
          note?: string | null;
          verified_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_log_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_log_shift_id_fkey';
            columns: ['shift_id'];
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          }
        ];
      };

      volunteer_certificates: {
        Row: {
          id: string;
          user_id: string;
          certificate_no: string;
          recipient_name: string;
          period_start: string;
          period_end: string;
          total_hours: number;
          entry_count: number;
          entries: Json;
          issued_by: string;
          issued_by_name: string;
          issued_by_title: string | null;
          issued_at: string;
          revoked_at: string | null;
          revoked_reason: string | null;
        };
        // Admins only, and `issued_by` must equal auth.uid() per the WITH CHECK.
        Insert: {
          id?: string;
          user_id: string;
          certificate_no: string;
          recipient_name: string;
          period_start: string;
          period_end: string;
          total_hours: number;
          entry_count?: number;
          entries?: Json;
          issued_by: string;
          issued_by_name: string;
          issued_by_title?: string | null;
        };
        // Issued figures are frozen; only revocation is granted at column level.
        Update: {
          revoked_at?: string | null;
          revoked_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'volunteer_certificates_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      donations: {
        Row: {
          id: string;
          stripe_session_id: string | null;
          stripe_payment_intent: string | null;
          stripe_subscription: string | null;
          amount_cents: number;
          currency: string;
          frequency: DonationFrequencyRow;
          donor_name: string | null;
          donor_email: string | null;
          status: DonationStatusRow;
          receipt_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // Written exclusively by the Stripe webhook using the service role key.
        Insert: never;
        Update: never;
        Relationships: [];
      };

      contact_messages: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          message: string;
          source_ip: string | null;
          handled: boolean;
          created_at: string;
        };
        // Written exclusively by the send-contact-message Edge Function.
        Insert: never;
        Update: {
          handled?: boolean;
        };
        Relationships: [];
      };
    };

    Views: Record<never, never>;

    Functions: {
      create_rsvp: {
        Args: {
          p_event_id: string;
          p_full_name: string;
          p_email: string;
          p_phone?: string | null;
          p_guest_count?: number;
          p_optional_donation?: number;
        };
        Returns: Database['public']['Tables']['rsvps']['Row'];
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      /**
       * Public certificate lookup. Callable by anon on purpose — it takes one
       * unguessable number and returns only what a verifier needs to see.
       */
      verify_certificate: {
        Args: { p_certificate_no: string };
        Returns: {
          certificate_no: string;
          recipient_name: string;
          total_hours: number;
          period_start: string;
          period_end: string;
          issued_at: string;
          issued_by_name: string;
          issued_by_title: string | null;
          is_valid: boolean;
          revoked_at: string | null;
        }[];
      };
    };

    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

/** Convenience aliases so call sites don't repeat the index gymnastics. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
