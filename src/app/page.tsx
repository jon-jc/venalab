import { redirect } from "next/navigation";

/** The site opens straight into the practice simulator. */
export default function Home() {
  redirect("/atlas");
}
