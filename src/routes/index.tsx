import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { routePaths, SEGMENTS } from "@/constants/routePaths";
import { codeReviewRoutes } from "./codeReviewRoutes";


export const routeTree: RouteObject[] = [
  {
    path: "/",
    children: [
      // `replace` so the redirect does not sit in history and trap the back
      // button in a loop between `/` and `/crp`.
      { index: true, element: <Navigate to={routePaths.crp.home} replace /> },
      { path: SEGMENTS.crp, children: codeReviewRoutes },
    ],
  },
];

export const router = createBrowserRouter(routeTree);