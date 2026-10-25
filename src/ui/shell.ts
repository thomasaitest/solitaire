/** Whether the Safari "Add to Home Screen" hint should appear. Native builds never show it. */
export function shouldShowInstallHint(input: {
  native: boolean;
  iosBrowser: boolean;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  if (input.native || input.dismissed || input.standalone) return false;
  return input.iosBrowser;
}
