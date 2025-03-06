import { TicketUpload } from "@/components/TicketUpload";

export default function TicketImportPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8 text-center">Ticket History Import</h1>
      <TicketUpload />
    </div>
  );
} 