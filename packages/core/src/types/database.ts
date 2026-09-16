export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  private: {
    Tables: {
      invite_revocations: {
        Row: {
          created_at: string;
          night_id: string;
          request_key: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          night_id: string;
          request_key: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          night_id?: string;
          request_key?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      complete_signup: {
        Args: { p_age_confirmed: boolean; p_display_name: string };
        Returns: undefined;
      };
      alert_json: {
        Args: { p_alert: Database['public']['Tables']['night_alerts']['Row'] };
        Returns: Json;
      };
      applicable_end_at: {
        Args: {
          p_consumed_at: string;
          p_initial_ends_at: string;
          p_night_id: string;
        };
        Returns: string;
      };
      build_night_snapshot: {
        Args: { p_night_id: string; p_user_id: string };
        Returns: Json;
      };
      can_manage_member: {
        Args: { p_member_id: string; p_user_id: string };
        Returns: boolean;
      };
      can_read_profile: {
        Args: { p_profile_id: string; p_user_id: string };
        Returns: boolean;
      };
      create_due_notification_events: { Args: never; Returns: undefined };
      drink_log_json: {
        Args: { p_log: Database['public']['Tables']['drink_logs']['Row'] };
        Returns: Json;
      };
      insert_notification_event: {
        Args: {
          p_body: string;
          p_category: string;
          p_deep_link: string;
          p_event_key: string;
          p_event_type: string;
          p_expires_at: string;
          p_night_id: string;
          p_recipient_user_id: string;
          p_sender_user_id: string;
          p_target_member_id: string;
          p_title: string;
        };
        Returns: string;
      };
      insert_plan: {
        Args: {
          p_actor_user_id: string;
          p_created_at: string;
          p_member_id: string;
          p_plan: Json;
        };
        Returns: undefined;
      };
      is_current_night_member: {
        Args: { p_night_id: string; p_user_id: string };
        Returns: boolean;
      };
      notification_is_current: {
        Args: { e: Database['public']['Tables']['notification_events']['Row'] };
        Returns: boolean;
      };
      process_due_notification_events: {
        Args: { p_user_id?: string };
        Returns: undefined;
      };
      revoke_invite_once: {
        Args: { p_night_id: string; p_request_key: string };
        Returns: Json;
      };
      submit_support_request: {
        Args: { p_kind: string; p_message: string; p_request_key: string };
        Returns: string;
      };
      sync_notification_schedules: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      validate_plan: { Args: { p_plan: Json }; Returns: undefined };
      water_log_json: {
        Args: { p_log: Database['public']['Tables']['water_logs']['Row'] };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          night_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          night_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          night_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
        ];
      };
      checkin_requests: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          night_id: string;
          recipient_user_id: string;
          request_key: string;
          seen_at: string | null;
          sender_user_id: string;
          status: string;
          target_member_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          night_id: string;
          recipient_user_id: string;
          request_key: string;
          seen_at?: string | null;
          sender_user_id: string;
          status?: string;
          target_member_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          night_id?: string;
          recipient_user_id?: string;
          request_key?: string;
          seen_at?: string | null;
          sender_user_id?: string;
          status?: string;
          target_member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'checkin_requests_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'checkin_requests_recipient_user_id_fkey';
            columns: ['recipient_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'checkin_requests_sender_user_id_fkey';
            columns: ['sender_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'checkin_requests_target_member_id_fkey';
            columns: ['target_member_id'];
            isOneToOne: false;
            referencedRelation: 'night_members';
            referencedColumns: ['id'];
          },
        ];
      };
      drink_logs: {
        Row: {
          abv_percent: number;
          actor_user_id: string | null;
          after_end: boolean;
          category_snapshot: string;
          consumed_at: string;
          created_at: string;
          deleted_at: string | null;
          ethanol_grams: number | null;
          id: string;
          idempotency_key: string;
          label_snapshot: string;
          night_id: string;
          night_member_id: string;
          plan_item_id: string | null;
          volume_ml: number;
        };
        Insert: {
          abv_percent: number;
          actor_user_id?: string | null;
          after_end?: boolean;
          category_snapshot: string;
          consumed_at: string;
          created_at?: string;
          deleted_at?: string | null;
          ethanol_grams?: number | null;
          id?: string;
          idempotency_key: string;
          label_snapshot: string;
          night_id: string;
          night_member_id: string;
          plan_item_id?: string | null;
          volume_ml: number;
        };
        Update: {
          abv_percent?: number;
          actor_user_id?: string | null;
          after_end?: boolean;
          category_snapshot?: string;
          consumed_at?: string;
          created_at?: string;
          deleted_at?: string | null;
          ethanol_grams?: number | null;
          id?: string;
          idempotency_key?: string;
          label_snapshot?: string;
          night_id?: string;
          night_member_id?: string;
          plan_item_id?: string | null;
          volume_ml?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'drink_logs_member_night_fk';
            columns: ['night_id', 'night_member_id'];
            isOneToOne: false;
            referencedRelation: 'night_members';
            referencedColumns: ['night_id', 'id'];
          },
          {
            foreignKeyName: 'drink_logs_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'drink_logs_plan_member_fk';
            columns: ['night_member_id', 'plan_item_id'];
            isOneToOne: false;
            referencedRelation: 'drink_plan_items';
            referencedColumns: ['night_member_id', 'id'];
          },
        ];
      };
      drink_plan_items: {
        Row: {
          abv_percent: number;
          archived_at: string | null;
          category: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_quick_log: boolean;
          label: string;
          night_member_id: string;
          planned_quantity: number;
          updated_at: string;
          volume_ml: number;
        };
        Insert: {
          abv_percent: number;
          archived_at?: string | null;
          category: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_quick_log?: boolean;
          label: string;
          night_member_id: string;
          planned_quantity: number;
          updated_at?: string;
          volume_ml: number;
        };
        Update: {
          abv_percent?: number;
          archived_at?: string | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_quick_log?: boolean;
          label?: string;
          night_member_id?: string;
          planned_quantity?: number;
          updated_at?: string;
          volume_ml?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'drink_plan_items_night_member_id_fkey';
            columns: ['night_member_id'];
            isOneToOne: false;
            referencedRelation: 'night_members';
            referencedColumns: ['id'];
          },
        ];
      };
      night_alerts: {
        Row: {
          created_at: string;
          dedupe_key: string;
          expires_at: string | null;
          id: string;
          message: string;
          night_id: string;
          night_member_id: string | null;
          severity: string;
          type: string;
          visibility: string;
        };
        Insert: {
          created_at?: string;
          dedupe_key: string;
          expires_at?: string | null;
          id?: string;
          message: string;
          night_id: string;
          night_member_id?: string | null;
          severity: string;
          type: string;
          visibility: string;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          expires_at?: string | null;
          id?: string;
          message?: string;
          night_id?: string;
          night_member_id?: string | null;
          severity?: string;
          type?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'night_alerts_member_night_fk';
            columns: ['night_id', 'night_member_id'];
            isOneToOne: false;
            referencedRelation: 'night_members';
            referencedColumns: ['night_id', 'id'];
          },
          {
            foreignKeyName: 'night_alerts_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
        ];
      };
      night_end_time_changes: {
        Row: {
          changed_by: string;
          created_at: string;
          effective_at: string;
          id: string;
          new_ends_at: string;
          night_id: string;
          previous_ends_at: string;
        };
        Insert: {
          changed_by: string;
          created_at?: string;
          effective_at?: string;
          id?: string;
          new_ends_at: string;
          night_id: string;
          previous_ends_at: string;
        };
        Update: {
          changed_by?: string;
          created_at?: string;
          effective_at?: string;
          id?: string;
          new_ends_at?: string;
          night_id?: string;
          previous_ends_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'night_end_time_changes_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
        ];
      };
      night_invites: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          max_uses: number | null;
          night_id: string;
          revoked_at: string | null;
          token_hash: string;
          use_count: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at: string;
          id?: string;
          max_uses?: number | null;
          night_id: string;
          revoked_at?: string | null;
          token_hash: string;
          use_count?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          max_uses?: number | null;
          night_id?: string;
          revoked_at?: string | null;
          token_hash?: string;
          use_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'night_invites_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
        ];
      };
      night_members: {
        Row: {
          display_name: string;
          display_name_at_end: string | null;
          id: string;
          joined_at: string;
          left_at: string | null;
          managed_by_user_id: string | null;
          member_type: string;
          night_id: string;
          plan_revision: number;
          plan_setup_completed_at: string | null;
          role: string;
          user_id: string | null;
        };
        Insert: {
          display_name: string;
          display_name_at_end?: string | null;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          managed_by_user_id?: string | null;
          member_type: string;
          night_id: string;
          plan_revision?: number;
          plan_setup_completed_at?: string | null;
          role?: string;
          user_id?: string | null;
        };
        Update: {
          display_name?: string;
          display_name_at_end?: string | null;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          managed_by_user_id?: string | null;
          member_type?: string;
          night_id?: string;
          plan_revision?: number;
          plan_setup_completed_at?: string | null;
          role?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'night_members_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
        ];
      };
      nights: {
        Row: {
          created_at: string;
          creation_key: string;
          ended_at: string | null;
          ends_at: string;
          host_user_id: string;
          id: string;
          initial_ends_at: string;
          starts_at: string;
          status: string;
          timezone: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          creation_key: string;
          ended_at?: string | null;
          ends_at: string;
          host_user_id: string;
          id?: string;
          initial_ends_at: string;
          starts_at: string;
          status?: string;
          timezone: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creation_key?: string;
          ended_at?: string | null;
          ends_at?: string;
          host_user_id?: string;
          id?: string;
          initial_ends_at?: string;
          starts_at?: string;
          status?: string;
          timezone?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_deliveries: {
        Row: {
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          event_id: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          status: string;
          subscription_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          event_id: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          status?: string;
          subscription_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          event_id?: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          status?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_deliveries_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'notification_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_deliveries_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'push_subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_events: {
        Row: {
          acknowledged_at: string | null;
          body: string;
          category: string;
          created_at: string;
          deep_link: string;
          event_key: string;
          event_type: string;
          expires_at: string | null;
          id: string;
          night_id: string | null;
          recipient_user_id: string;
          sender_user_id: string | null;
          target_member_id: string | null;
          title: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          body: string;
          category: string;
          created_at?: string;
          deep_link: string;
          event_key: string;
          event_type: string;
          expires_at?: string | null;
          id?: string;
          night_id?: string | null;
          recipient_user_id: string;
          sender_user_id?: string | null;
          target_member_id?: string | null;
          title: string;
        };
        Update: {
          acknowledged_at?: string | null;
          body?: string;
          category?: string;
          created_at?: string;
          deep_link?: string;
          event_key?: string;
          event_type?: string;
          expires_at?: string | null;
          id?: string;
          night_id?: string | null;
          recipient_user_id?: string;
          sender_user_id?: string | null;
          target_member_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_events_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_events_recipient_user_id_fkey';
            columns: ['recipient_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_events_target_member_id_fkey';
            columns: ['target_member_id'];
            isOneToOne: false;
            referencedRelation: 'night_members';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          direct_checkins_enabled: boolean;
          group_attention_enabled: boolean;
          periodic_interval_minutes: number;
          periodic_water_enabled: boolean;
          personal_pace_enabled: boolean;
          planned_end_enabled: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          direct_checkins_enabled?: boolean;
          group_attention_enabled?: boolean;
          periodic_interval_minutes?: number;
          periodic_water_enabled?: boolean;
          personal_pace_enabled?: boolean;
          planned_end_enabled?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          direct_checkins_enabled?: boolean;
          group_attention_enabled?: boolean;
          periodic_interval_minutes?: number;
          periodic_water_enabled?: boolean;
          personal_pace_enabled?: boolean;
          planned_end_enabled?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_schedules: {
        Row: {
          created_at: string;
          id: string;
          interval_minutes: number | null;
          kind: string;
          next_due_at: string;
          night_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          interval_minutes?: number | null;
          kind: string;
          next_due_at: string;
          night_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          interval_minutes?: number | null;
          kind?: string;
          next_due_at?: string;
          night_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_schedules_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_schedules_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          disabled_at: string | null;
          endpoint: string;
          expiration_time: string | null;
          id: string;
          p256dh: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          disabled_at?: string | null;
          endpoint: string;
          expiration_time?: string | null;
          id?: string;
          p256dh: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          disabled_at?: string | null;
          endpoint?: string;
          expiration_time?: string | null;
          id?: string;
          p256dh?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      support_requests: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          message: string;
          request_key: string;
          response: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          message: string;
          request_key: string;
          response?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          message?: string;
          request_key?: string;
          response?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      water_logs: {
        Row: {
          actor_user_id: string | null;
          consumed_at: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          idempotency_key: string;
          night_id: string;
          night_member_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          consumed_at: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          idempotency_key: string;
          night_id: string;
          night_member_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          consumed_at?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          idempotency_key?: string;
          night_id?: string;
          night_member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'water_logs_member_night_fk';
            columns: ['night_id', 'night_member_id'];
            isOneToOne: false;
            referencedRelation: 'night_members';
            referencedColumns: ['night_id', 'id'];
          },
          {
            foreignKeyName: 'water_logs_night_id_fkey';
            columns: ['night_id'];
            isOneToOne: false;
            referencedRelation: 'nights';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      acknowledge_check_in: { Args: { p_request_id: string }; Returns: Json };
      acknowledge_notification: {
        Args: { p_notification_id: string };
        Returns: Json;
      };
      add_managed_guest: {
        Args: { p_display_name: string; p_night_id: string; p_plan: Json };
        Returns: Json;
      };
      can_display_notification: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      claim_notification_jobs: { Args: { p_limit?: number }; Returns: Json };
      complete_signup: {
        Args: { p_age_confirmed: boolean; p_display_name: string };
        Returns: undefined;
      };
      complete_notification_job: {
        Args: {
          p_attempt?: number;
          p_delivered: boolean;
          p_delivery_id: string;
          p_error?: string;
          p_permanent_failure?: boolean;
        };
        Returns: Json;
      };
      create_night_invite: {
        Args: {
          p_expires_at: string;
          p_max_uses?: number;
          p_night_id: string;
          p_token_hash: string;
        };
        Returns: Json;
      };
      end_night: { Args: { p_night_id: string }; Returns: Json };
      extend_night: {
        Args: { p_minutes: number; p_night_id: string };
        Returns: Json;
      };
      find_drink_by_idempotency_key: {
        Args: { p_idempotency_key: string };
        Returns: Json;
      };
      get_active_nights: { Args: never; Returns: Json };
      get_finished_night_summary: {
        Args: { p_night_id: string };
        Returns: Json;
      };
      get_finished_nights: { Args: { p_page?: number }; Returns: Json };
      get_invite_preview: { Args: { p_token_hash: string }; Returns: Json };
      get_my_notification_events: { Args: { p_limit?: number }; Returns: Json };
      get_night_snapshot: { Args: { p_night_id: string }; Returns: Json };
      get_notification_preferences: { Args: never; Returns: Json };
      leave_night: { Args: { p_night_id: string }; Returns: Json };
      log_drink: {
        Args: {
          p_ack_after_end?: boolean;
          p_ack_plan_exceeded?: boolean;
          p_consumed_at?: string;
          p_custom_drink?: Json;
          p_idempotency_key?: string;
          p_plan_item_id?: string;
          p_target_member_id: string;
        };
        Returns: Json;
      };
      log_water: {
        Args: {
          p_consumed_at: string;
          p_idempotency_key: string;
          p_target_member_id: string;
        };
        Returns: Json;
      };
      redeem_night_invite: { Args: { p_token_hash: string }; Returns: Json };
      register_push_subscription: {
        Args: {
          p_auth: string;
          p_endpoint: string;
          p_expiration_time?: string;
          p_p256dh: string;
        };
        Returns: Json;
      };
      remove_managed_guest: { Args: { p_member_id: string }; Returns: Json };
      remove_push_subscription: { Args: { p_endpoint: string }; Returns: Json };
      replace_member_plan: {
        Args: { p_items: Json; p_member_id: string };
        Returns: Json;
      };
      replace_member_plan_v2: {
        Args: {
          p_expected_revision?: number;
          p_items: Json;
          p_member_id: string;
        };
        Returns: Json;
      };
      revoke_night_invite: { Args: { p_night_id: string }; Returns: Json };
      revoke_night_invite_once: {
        Args: { p_night_id: string; p_request_key: string };
        Returns: Json;
      };
      rotate_night_invite: {
        Args: {
          p_expires_at: string;
          p_max_uses?: number;
          p_night_id: string;
          p_token_hash: string;
        };
        Returns: Json;
      };
      send_check_in: {
        Args: {
          p_night_id: string;
          p_request_key: string;
          p_target_member_id: string;
        };
        Returns: Json;
      };
      soft_delete_activity: {
        Args: { p_kind: string; p_log_id: string };
        Returns: Json;
      };
      start_night_out: {
        Args: {
          p_creation_key: string;
          p_ends_at: string;
          p_guests?: Json;
          p_host_plan: Json;
          p_timezone: string;
          p_title: string;
        };
        Returns: Json;
      };
      submit_support_request: {
        Args: { p_kind: string; p_message: string; p_request_key: string };
        Returns: string;
      };
      update_night_title: {
        Args: { p_night_id: string; p_title: string };
        Returns: Json;
      };
      update_notification_preferences: {
        Args: {
          p_direct_checkins_enabled: boolean;
          p_group_attention_enabled: boolean;
          p_periodic_interval_minutes: number;
          p_periodic_water_enabled: boolean;
          p_personal_pace_enabled: boolean;
          p_planned_end_enabled: boolean;
        };
        Returns: Json;
      };
      update_own_display_name: {
        Args: { p_display_name: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
