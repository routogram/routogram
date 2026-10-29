export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: "customer" | "admin";
  avatar: string;
};

export type AuthPayload = {
  token: string;
  user: UserProfile;
};
