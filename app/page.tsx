import { Chat } from "@/components/Chat";

export default function Home() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8 text-center">KA (Kick Ass) Chatbot</h1>
      <Chat />
    </div>
  );
}
