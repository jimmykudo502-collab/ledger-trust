/**
 * An error whose message is written for the bookkeeper and can be shown in
 * the UI as is, e.g. "Account code 4000 already exists."
 */
export class UserFacingError extends Error {
  /**
   * @param message A plain-language explanation of what went wrong.
   */
  public constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
