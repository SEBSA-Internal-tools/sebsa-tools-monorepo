import type { RouteObject } from "react-router-dom";


/**
 * Code Review Portal routes.
 *
 * Every page is a React Router 7 lazy route module — the module exports
 * `Component`, and the whole module (page, and later its loader) is code-split
 * as one chunk. No path literals appear here; they come from
 * `constants/routePaths`, so an address is declared in exactly one place.
 */
export const codeReviewRoutes: RouteObject[] = [
  {
    // The portal's own landing page
    index: true,
    lazy: () => import("@/pages/CodeReviewHomePage"),
  },  
];
