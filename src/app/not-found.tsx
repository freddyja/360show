import Link from "next/link";

export default function NotFound() {
  return (
    <div className="booth-page flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="text-sm tracking-[0.28em] text-slate-500 uppercase">360show</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Page not found</h1>
      <Link href="/" className="mt-6 rounded-full bg-blue-500 px-5 py-2 text-sm text-white">
        Back to events
      </Link>
    </div>
  );
}
