"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, HelpCircle, Ticket } from "lucide-react";

type MessageSource = "user" | "faq" | "ai" | "error";

type Message = {
  id: string;
  text: string;
  sender: "user" | "bot";
  source: MessageSource;
  timestamp: Date;
  faqId?: number;
  ticketClassification?: {
    group: string;
    confidence: number;
    source: string;
    reasoning: string;
    alternativeGroups?: Array<{
      name: string;
      confidence: number;
    }>;
  };
};

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generate session ID only on the client side to avoid hydration mismatch
  useEffect(() => {
    setSessionId(`session-${Date.now()}`);
  }, []);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !sessionId) return;

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      text: inputValue,
      sender: "user",
      source: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Call API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          message: userMessage.text,
          sessionId: sessionId // Send session ID to maintain conversation context
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      // Add bot message
      const botMessage: Message = {
        id: crypto.randomUUID(),
        text: data.reply,
        sender: "bot",
        source: data.source || "ai",
        timestamp: new Date(),
        faqId: data.faqId,
        ticketClassification: data.ticketClassification
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      console.error("Error sending message:", error);
      
      // Add error message
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        text: error.message || "Sorry, I couldn't process your request. Please try again.",
        sender: "bot",
        source: "error",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Helper function to get message style based on source
  const getMessageStyle = (message: Message) => {
    if (message.sender === "user") {
      return "bg-primary text-primary-foreground";
    }
    
    switch (message.source) {
      case "faq":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
      case "ai":
        return "bg-muted";
      case "error":
        return "bg-destructive text-destructive-foreground";
      default:
        return "bg-muted";
    }
  };

  // Helper function to render message content with support group suggestions
  const renderMessageContent = (message: Message) => {
    // If it's not an AI message with ticket classification, just return the text
    if (message.source !== "ai" || !message.ticketClassification) {
      return <div>{message.text}</div>;
    }

    const classification = message.ticketClassification;
    
    // Get confidence level color
    const getConfidenceColor = (confidence: number) => {
      if (confidence >= 80) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
      if (confidence >= 60) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100";
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";
    };

    // Get confidence icon
    const getConfidenceIcon = (confidence: number) => {
      if (confidence >= 80) return <CheckCircle className="h-4 w-4" />;
      if (confidence >= 60) return <HelpCircle className="h-4 w-4" />;
      return <AlertCircle className="h-4 w-4" />;
    };

    // Handle ticket creation (placeholder function)
    const handleCreateTicket = () => {
      alert(`Creating ticket for support group: ${classification.group}`);
      // In a real implementation, this would open a ticket creation form or API call
    };

    return (
      <>
        <div>{message.text}</div>
        
        {/* Only show classification if confidence is above threshold */}
        {classification.confidence >= 50 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Ticket className="h-3.5 w-3.5" />
                <span>Ticket Classification</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs flex items-center gap-1"
                onClick={handleCreateTicket}
              >
                <Ticket className="h-3.5 w-3.5" />
                <span>Create Ticket</span>
              </Button>
            </div>
            
            <div className="space-y-2 text-sm">
              {/* Primary support group */}
              <div className="flex items-center justify-between">
                <div className="font-medium">Suggested Support Group:</div>
                <Badge className={getConfidenceColor(classification.confidence)}>
                  <span className="flex items-center gap-1">
                    {getConfidenceIcon(classification.confidence)}
                    {classification.group} ({classification.confidence}%)
                  </span>
                </Badge>
              </div>
              
              {/* Reasoning */}
              <div className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium">Reasoning:</span> {classification.reasoning}
              </div>
              
              {/* Alternative groups if available */}
              {classification.alternativeGroups && classification.alternativeGroups.length > 0 && (
                <div className="mt-1">
                  <div className="text-xs font-medium mb-1">Alternative Groups:</div>
                  <div className="flex flex-wrap gap-1">
                    {classification.alternativeGroups
                      .filter(alt => alt.confidence > 30)
                      .map((alt, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className={getConfidenceColor(alt.confidence)}
                        >
                          {alt.name} ({alt.confidence}%)
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <Card className="w-full max-w-2xl mx-auto h-[600px] flex flex-col">
      <CardContent className="flex flex-col h-full p-4">
        <div className="flex-1 overflow-y-scroll scrollbar-hide mb-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Send a message to start the conversation
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${getMessageStyle(message)}`}
                >
                  {message.source === "faq" && (
                    <div className="text-xs font-medium mb-1 opacity-70">From FAQ Database</div>
                  )}
                  {renderMessageContent(message)}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                <div className="flex items-center gap-1.5">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse animation-delay-200">●</span>
                  <span className="animate-pulse animation-delay-400">●</span>
                  <span className="ml-1.5">Typing...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Type your message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !sessionId}
            className="flex-1"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={isLoading || !inputValue.trim() || !sessionId}
          >
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 