import { AppBar } from "@/components/common/AppBar";
import { content } from "@/content";
import { Suspense } from "react";
import { Outlet } from "react-router-dom";

const AppLayout = () => {

    return (
        <div>
            <div className="flex min-h-dvh flex-col bg-page">
                <AppBar />
            </div>

            <main id="main" aria-label={content.a11y.mainLandmark} className="flex-1">
                {/* Route modules are lazily loaded, so every navigation needs a fallback. */}
                <Suspense fallback={<div></div>}>
                    <Outlet />
                </Suspense>
            </main>
        </div>
    );
}

export default AppLayout;
