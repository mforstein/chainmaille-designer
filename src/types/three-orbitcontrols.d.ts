import "three";

declare module "three/examples/jsm/controls/OrbitControls" {
  interface OrbitControls {
    touches: {
      ONE: number;
      TWO: number;
    };
    dollyIn: (scale: number) => void;
    dollyOut: (scale: number) => void;
  }
}