import type { RequestFn } from "../http/httpClient";
import type {
  User,
  UserBasic,
  UserCreateRequest,
  UserUpdateRequest,
} from "../types";

/** `client.users` — user management (admin) and account actions. */
export class UsersResource {
  constructor(private readonly request: RequestFn) {}

  /** Admins receive full `User` objects; other roles receive `UserBasic`. */
  list(): Promise<User[] | UserBasic[]> {
    return this.request("GET", "/users/");
  }

  get(userId: string): Promise<User> {
    return this.request("GET", `/users/${encodeURIComponent(userId)}`);
  }

  create(params: UserCreateRequest): Promise<User> {
    return this.request("POST", "/users/", { body: params });
  }

  update(userId: string, params: UserUpdateRequest): Promise<User> {
    return this.request("PATCH", `/users/${encodeURIComponent(userId)}`, {
      body: params,
    });
  }

  delete(userId: string): Promise<void> {
    return this.request("DELETE", `/users/${encodeURIComponent(userId)}`);
  }

  block(userId: string): Promise<User> {
    return this.request("POST", `/users/${encodeURIComponent(userId)}/block`);
  }

  unblock(userId: string): Promise<User> {
    return this.request("POST", `/users/${encodeURIComponent(userId)}/unblock`);
  }
}
