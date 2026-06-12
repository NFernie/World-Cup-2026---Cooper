export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string
          fifa_code: string
          name: string
          group_letter: string | null
          flag_url: string | null
          tournament_stage: string
          group_position: number | null
          group_points: number
          group_goal_difference: number
          tournament_rank: number | null
          api_football_team_id: number | null
          awards_synced_at: string | null
          global_fifa_rank: number | null
          golden_boot_player_name: string | null
          golden_boot_goals: number
          golden_glove_player_name: string | null
          golden_glove_clean_sheets: number
          created_at: string
        }
      }
      pools: {
        Row: {
          id: string
          name: string
          host_user_id: string
          invite_code: string
          reveal_names: boolean
          team_assignment_mode: 'automatic' | 'host'
          join_locked: boolean
          created_at: string
        }
        Insert: {
          name: string
          host_user_id: string
          reveal_names?: boolean
          team_assignment_mode?: 'automatic' | 'host'
          join_locked?: boolean
        }
        Update: {
          reveal_names?: boolean
          team_assignment_mode?: 'automatic' | 'host'
          join_locked?: boolean
        }
      }
      pool_reveal_name_votes: {
        Row: {
          id: string
          pool_id: string
          pool_member_id: string
          wants_reveal: boolean
          updated_at: string
        }
        Insert: {
          pool_id: string
          pool_member_id: string
          wants_reveal: boolean
          updated_at?: string
        }
        Update: {
          wants_reveal?: boolean
          updated_at?: string
        }
      }
      pool_banter_messages: {
        Row: {
          id: string
          pool_id: string
          pool_member_id: string
          user_id: string
          display_name: string
          message: string
          metadata_json: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          pool_id: string
          pool_member_id: string
          user_id: string
          display_name: string
          message: string
          metadata_json?: Record<string, unknown> | null
        }
      }
      pool_members: {
        Row: {
          id: string
          pool_id: string
          user_id: string
          display_name: string
          assigned_team_id: string | null
          join_order: number
          assignment_round: number
          created_at: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          username: string
          is_super_admin: boolean
          created_at: string
        }
      }
      matches: {
        Row: {
          id: string
          external_id: string | null
          home_team_id: string
          away_team_id: string
          kickoff_at: string
          home_score: number | null
          away_score: number | null
          status: string
          stage: string
          odds_synced_at: string | null
          scores_synced_at: string | null
          events_synced_at: string | null
          venue_name: string | null
          venue_city: string | null
          referee: string | null
          attendance: number | null
          created_at: string
        }
      }
      match_events: {
        Row: {
          id: string
          match_id: string
          minute: number
          extra_minute: number | null
          team_api_id: number | null
          player_name: string
          assist_name: string | null
          event_type: string
          detail: string | null
          sort_order: number
          synced_at: string
        }
      }
      match_odds: {
        Row: {
          match_id: string
          home_win_decimal: number
          draw_decimal: number
          away_win_decimal: number
          source: string
          fetched_at: string
        }
      }
      member_match_points: {
        Row: {
          id: string
          pool_member_id: string
          match_id: string
          points: number
          win_odds_decimal: number
          created_at: string
        }
      }
      app_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
      }
      squad_players: {
        Row: {
          id: string
          team_id: string
          api_football_player_id: number | null
          name: string
          position: string
          position_code: string | null
          position_detail: string | null
          shirt_number: number | null
          photo_url: string | null
          overall_rating: number
          rating_source: string
          baseline_club_api_team_id: number | null
          baseline_league_id: number | null
          has_continental_rating: boolean
          form_boost_pct: number
          form_match_rating: number | null
          form_fixture_ids: Json | null
          form_synced_at: string | null
          synced_at: string
        }
      }
      squad_player_form_log: {
        Row: {
          id: string
          squad_player_id: string
          api_football_player_id: number | null
          fixture_external_id: string | null
          match_rating: number | null
          minutes: number | null
          old_boost_pct: number | null
          new_boost_pct: number
          reason: string
          synced_at: string
        }
      }
      xi_game_sessions: {
        Row: {
          id: string
          user_id: string
          pool_id: string | null
          formation: string
          mode: string
          status: string
          result_json: Json | null
          created_at: string
        }
        Insert: {
          user_id: string
          pool_id?: string | null
          formation: string
          mode?: string
          status?: string
          result_json?: Json | null
        }
        Update: {
          status?: string
          result_json?: Json | null
        }
      }
      xi_game_picks: {
        Row: {
          session_id: string
          round: number
          spun_team_id: string | null
          squad_player_id: string | null
          slot_position: string
        }
        Insert: {
          session_id: string
          round: number
          spun_team_id?: string | null
          squad_player_id?: string | null
          slot_position: string
        }
      }
    }
    Views: {
      leaderboard_odds_points: {
        Row: {
          pool_id: string
          pool_member_id: string
          user_id: string
          display_name: string
          assigned_team_id: string | null
          team_name: string | null
          fifa_code: string | null
          global_fifa_rank: number | null
          total_points: number
          wins_scored: number
        }
      }
      leaderboard_tournament_standing: {
        Row: {
          pool_id: string
          team_id: string
          team_name: string
          fifa_code: string
          tournament_stage: string
          tournament_rank: number | null
          global_fifa_rank: number | null
          group_letter: string | null
          group_position: number | null
          group_points: number
          group_goal_difference: number
          manager_names: string[]
          pool_member_ids: string[]
          co_manager_count: number
        }
      }

      leaderboard_golden_boot: {
        Row: {
          pool_id: string
          team_id: string
          team_name: string
          fifa_code: string
          golden_boot_player_name: string | null
          golden_boot_goals: number
          global_fifa_rank: number | null
          pool_member_ids: string[]
          boot_rank: number
        }
      }
      leaderboard_golden_glove: {
        Row: {
          pool_id: string
          team_id: string
          team_name: string
          fifa_code: string
          golden_glove_player_name: string | null
          golden_glove_clean_sheets: number
          global_fifa_rank: number | null
          pool_member_ids: string[]
          glove_rank: number
        }
      }
      board_group_eliminations: {
        Row: {
          team_id: string
          team_name: string
          fifa_code: string
          tournament_stage: string
          global_fifa_rank: number | null
          tournament_rank: number | null
          group_letter: string | null
          group_position: number | null
        }
      }
      board_knockout_qualifiers: {
        Row: {
          team_id: string
          team_name: string
          fifa_code: string
          tournament_stage: string
          global_fifa_rank: number | null
          tournament_rank: number | null
        }
      }
      pool_team_co_managers: {
        Row: {
          pool_id: string
          team_id: string
          team_name: string
          pool_member_id: string
          display_name: string
          user_id: string
          join_order: number
        }
      }
    }
    Functions: {
      is_username_available: {
        Args: { p_username: string }
        Returns: boolean
      }
      join_pool: {
        Args: { p_pool_id: string; p_display_name: string }
        Returns: Database['public']['Tables']['pool_members']['Row']
      }
      set_pool_reveal_names: {
        Args: { p_pool_id: string; p_reveal_names: boolean }
        Returns: Database['public']['Tables']['pools']['Row']
      }
      set_pool_join_locked: {
        Args: { p_pool_id: string; p_join_locked: boolean }
        Returns: Database['public']['Tables']['pools']['Row']
      }
      assign_pool_member_team: {
        Args: { p_pool_member_id: string }
        Returns: Database['public']['Tables']['pool_members']['Row']
      }
      recalculate_pool_member_points: {
        Args: { p_match_id?: string }
        Returns: void
      }
    }
  }
}

export type Team = Database['public']['Tables']['teams']['Row']
export type Pool = Database['public']['Tables']['pools']['Row']
export type PoolMember = Database['public']['Tables']['pool_members']['Row']
export type LeaderboardOddsRow = Database['public']['Views']['leaderboard_odds_points']['Row']
export type LeaderboardTournamentRow =
  Database['public']['Views']['leaderboard_tournament_standing']['Row']
