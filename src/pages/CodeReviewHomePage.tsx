import { AppBar } from "@/components/ui";

/**
 * The Code Review Portal landing page.
 *
 * Mounted at `/crp` as a React Router 7 *lazy route module*: `codeReviewRoutes`
 * points at this file with `lazy: () => import(...)`, and the router reads the
 * module's exports as route fields. That is why the named export `Component`
 * below is not optional — without it the module contributes no route fields and
 * the `lazy` property fails to type-check.
 */
export function CodeReviewHomePage() {
  return (
    <div>
      <div>
        <AppBar />
      </div>
      
      <section className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-purple-900 sm:text-5xl md:text-6xl lg:text-7xl">
            Service Delivery Portal
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">
            Code Review Portal  |  Delivery Portal  |  Wiki
          </p>

          <div className="mt-8 flex justify-center gap-4">
            <button className="rounded-lg bg-purple-700 px-6 py-3 font-semibold text-white hover:bg-purple-900 cursor-pointer">
              Get Started
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The route-module contract. React Router renders whatever the resolved module
 * exports as `Component`; the aliased re-export keeps the descriptive name for
 * direct imports (tests, Storybook) while still satisfying the router.
 */
export { CodeReviewHomePage as Component };
export default CodeReviewHomePage;
