import { CredentialsSignin } from "next-auth";

/** Thrown from credentials `authorize` when the password is correct but email is not verified yet. */
export class EmailNotVerified extends CredentialsSignin {
  code = "verify_email";
}
