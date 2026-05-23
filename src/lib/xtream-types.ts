export type XtreamCredentials = {
  server: string;
  username: string;
  password: string;
};

export type UserInfo = {
  username: string;
  password: string;
  message?: string;
  auth: 0 | 1;
  status: string;
  exp_date?: string | null;
  is_trial?: string;
  active_cons?: string;
  created_at?: string;
  max_connections?: string;
  allowed_output_formats?: string[];
};

export type ServerInfo = {
  url: string;
  port: string;
  https_port?: string;
  server_protocol: "http" | "https";
  rtmp_port?: string;
  timezone?: string;
  timestamp_now?: number;
  time_now?: string;
  process?: boolean;
};

export type AuthResponse = {
  user_info: UserInfo;
  server_info: ServerInfo;
};

export type Category = {
  category_id: string;
  category_name: string;
  parent_id: number;
};

export type LiveStream = {
  num: number;
  name: string;
  stream_type: "live";
  stream_id: number;
  stream_icon: string;
  epg_channel_id?: string;
  added: string;
  is_adult?: 0 | 1 | string;
  category_id: string;
  category_ids?: number[];
  custom_sid?: string | null;
  tv_archive: 0 | 1 | string;
  direct_source?: string;
  tv_archive_duration?: number | string;
};

export type VodStream = {
  num: number;
  name: string;
  title?: string;
  year?: string;
  stream_type: "movie";
  stream_id: number;
  stream_icon: string;
  rating?: string;
  rating_5based?: number;
  added: string;
  is_adult?: 0 | 1 | string;
  category_id: string;
  container_extension?: string;
  custom_sid?: string | null;
  direct_source?: string;
};

export type SeriesItem = {
  num: number;
  name: string;
  title?: string;
  year?: string;
  series_id: number;
  cover: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  release_date?: string;
  last_modified?: string;
  rating?: string;
  rating_5based?: number;
  backdrop_path?: string[] | null;
  youtube_trailer?: string;
  episode_run_time?: string;
  category_id: string;
};

export type VodInfo = {
  info: {
    movie_image?: string;
    cover_big?: string;
    backdrop_path?: string[];
    name?: string;
    o_name?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    rating?: string;
    rating_count_kinopoisk?: number;
    releasedate?: string;
    release_date?: string;
    duration_secs?: number;
    duration?: string;
    youtube_trailer?: string;
    tmdb_id?: string;
    container_extension?: string;
  };
  movie_data: {
    stream_id: number;
    name: string;
    title?: string;
    year?: string;
    added?: string;
    category_id?: string;
    container_extension?: string;
    custom_sid?: string;
    direct_source?: string;
  };
};

export type SeriesEpisode = {
  id: string;
  episode_num: number | string;
  title: string;
  container_extension: string;
  info?: {
    plot?: string;
    duration_secs?: number;
    duration?: string;
    movie_image?: string;
    rating?: string | number;
    releasedate?: string;
    release_date?: string;
  };
  custom_sid?: string;
  added?: string;
  season?: number;
  direct_source?: string;
};

export type SeriesInfo = {
  seasons: Array<{
    air_date?: string;
    episode_count?: number;
    id?: number;
    name?: string;
    overview?: string;
    season_number?: number;
    cover?: string;
    cover_big?: string;
  }>;
  info: {
    name: string;
    cover: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    release_date?: string;
    last_modified?: string;
    rating?: string;
    rating_5based?: number;
    backdrop_path?: string[];
    youtube_trailer?: string;
    episode_run_time?: string;
    category_id?: string;
  };
  episodes: Record<string, SeriesEpisode[]>;
};

export type ShortEPG = {
  epg_listings: Array<{
    id: string;
    epg_id: string;
    title: string;
    lang?: string;
    start: string;
    end: string;
    description: string;
    channel_id: string;
    start_timestamp: string;
    stop_timestamp: string;
    now_playing?: number;
    has_archive?: number;
  }>;
};
