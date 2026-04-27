import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
export const metadata = {
  title: "PrizePilot",
  description:
    "PrizePilot helps businesses and creators launch professional giveaways, contests, referral challenges, and loyalty rewards.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
