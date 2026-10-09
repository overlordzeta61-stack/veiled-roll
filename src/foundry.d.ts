/**
 * Minimal ambient declarations for the Foundry VTT runtime globals.
 *
 * The module deliberately treats Foundry and D&D5e structures as untyped
 * (`AnyObject`) and accesses them defensively; the precise shapes change between
 * versions. Pure business logic never touches these globals.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyObject = any;

  const game: AnyObject;
  const foundry: AnyObject;
  const ui: AnyObject;
  const Hooks: AnyObject;
  const CONFIG: AnyObject;
  const ChatMessage: AnyObject;
  const Handlebars: AnyObject;
  const canvas: AnyObject;
  function fromUuid(uuid: string): Promise<unknown>;
}

export {};
