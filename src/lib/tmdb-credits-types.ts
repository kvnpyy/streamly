export type TmdbCastMember = {
  id: number;
  name: string;
  character?: string;
  profileUrl: string | null;
};

export type TmdbCreditsResponse = {
  cast: TmdbCastMember[];
};
