import NavBar from "@/components/NavBar";

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <NavBar />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
