declare module "robotjs" {
  function moveMouse(x: number, y: number): void;
  function mouseClick(button?: "left" | "right", double?: boolean): void;
  function mouseToggle(action: "up" | "down", button?: "left" | "right"): void;
  function scrollMouse(x: number, y: number): void;
  function getMousePos(): { x: number; y: number };
  function keyTap(key: string, modifier?: string | string[]): void;
  function typeString(str: string): void;
  function setMouseDelay(delay: number): void;
  function setKeyboardDelay(delay: number): void;
}
