import { Link } from "wouter";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white px-6 py-4">
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p className="text-xs text-gray-400">
          &copy; {year} TanCom.US — All rights reserved.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/privacy-policy">
            <span className="text-xs text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
              Privacy Policy
            </span>
          </Link>
          <Link href="/terms-of-service">
            <span className="text-xs text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
              Terms of Service
            </span>
          </Link>
          <Link href="/cookie-policy">
            <span className="text-xs text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
              Cookie Policy
            </span>
          </Link>
          <Link href="/user-manual">
            <span className="text-xs text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
              Help &amp; Support
            </span>
          </Link>
          <Link href="/contact">
            <span className="text-xs text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
              Contact Us
            </span>
          </Link>
        </nav>
      </div>
    </footer>
  );
}
