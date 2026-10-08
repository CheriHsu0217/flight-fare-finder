import { createBrowserRouter, type RouteObject } from "react-router";

import { RootLayout, NotFound, RootErrorBoundary } from "./pages/Root";
import { Index } from "./pages/Index";
import { SignIn, SignUp } from "./pages/Auth";
import { RequireAuth } from "./pages/RequireAuth";
import { AppPage } from "./pages/App";

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      { path: "/", element: <Index /> },
      { path: "/signin", element: <SignIn /> },
      { path: "/signup", element: <SignUp /> },
      {
        element: <RequireAuth />,
        children: [{ path: "/app", element: <AppPage /> }],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
