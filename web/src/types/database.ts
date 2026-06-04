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
          created_at: string
        }
      }
      pools: {
        Row: {
          id: string
          name: string
          host_user_id: string
          invite_code: string
          created_at: string
        }
        Insert: {
          name: string
          host_user_id: string
        }
      }
      pool_members: {
        Row: {
          id: string
          pool_id: string
          user_id: string
          display_name: string
          assigned_team_id: string
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
          created_at: string
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
    }
    Views: {
      leaderboard_odds_points: {
        Row: {
          pool_id: string
          pool_member_id: string
          user_id: string
          display_name: string
          assigned_team_id: string
          team_name: string
          fifa_code: string
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
          group_letter: string | null
          group_position: number | null
          group_points: number
          group_goal_difference: number
          manager_names: string[]
          pool_member_ids: string[]
          co_manager_count: number
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
