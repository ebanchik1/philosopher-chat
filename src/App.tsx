import { useState, useEffect } from "react";
import {
  BookOpen,
  Scroll,
  Shield,
  Scale,
  Flame,
  Sparkles,
  Landmark,
  Brain,
  Users,
  Mountain,
} from "lucide-react";
import RadialOrbitalTimeline from "@/components/ui/radial-orbital-timeline";
import type { TimelineItem } from "@/components/ui/radial-orbital-timeline";
import Chat from "@/components/Chat";

interface Philosopher {
  id: string;
  name: string;
  era: string;
  tradition: string;
  shortDesc: string;
  color: string;
  image: string;
  greeting: string;
}

// Map philosopher IDs to appropriate icons
const philosopherIcons: Record<string, React.ElementType> = {
  socrates: BookOpen,
  aristotle: Scale,
  "marcus-aurelius": Shield,
  kant: Brain,
  nietzsche: Flame,
  "de-beauvoir": Sparkles,
  confucius: Landmark,
  descartes: Brain,
  sartre: Users,
  camus: Mountain,
};

// Define intellectual connections between philosophers
const philosopherConnections: Record<string, string[]> = {
  socrates: ["aristotle", "descartes"],
  aristotle: ["socrates", "kant", "confucius"],
  "marcus-aurelius": ["socrates", "camus"],
  kant: ["aristotle", "descartes", "de-beauvoir"],
  nietzsche: ["socrates", "camus", "sartre"],
  "de-beauvoir": ["sartre", "kant", "camus"],
  confucius: ["socrates", "aristotle", "marcus-aurelius"],
  descartes: ["socrates", "kant"],
  sartre: ["de-beauvoir", "nietzsche", "camus"],
  camus: ["sartre", "nietzsche", "marcus-aurelius"],
};

// Influence scores (philosophical impact rating)
const philosopherEnergy: Record<string, number> = {
  socrates: 100,
  aristotle: 98,
  confucius: 95,
  kant: 92,
  descartes: 88,
  nietzsche: 85,
  "de-beauvoir": 80,
  "marcus-aurelius": 78,
  sartre: 82,
  camus: 75,
};

function buildTimelineData(philosophers: Philosopher[]): TimelineItem[] {
  // Create an id map (philosopher string id -> numeric timeline id)
  const idMap: Record<string, number> = {};
  philosophers.forEach((p, i) => {
    idMap[p.id] = i + 1;
  });

  return philosophers.map((p, i) => ({
    id: i + 1,
    title: p.name,
    date: p.era,
    content: p.shortDesc,
    category: p.tradition,
    icon: philosopherIcons[p.id] || BookOpen,
    relatedIds: (philosopherConnections[p.id] || [])
      .filter((connId) => idMap[connId] !== undefined)
      .map((connId) => idMap[connId]),
    status: "completed" as const,
    energy: philosopherEnergy[p.id] || 70,
    image: p.image,
    philosopherId: p.id,
  }));
}

export default function App() {
  const [philosophers, setPhilosophers] = useState<Philosopher[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/philosophers")
      .then((res) => res.json())
      .then((data) => setPhilosophers(data))
      .catch(() =>
        setError("Failed to load philosophers. Is the server running?")
      );
  }, []);

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black text-white/70">
        <p>{error}</p>
      </div>
    );
  }

  if (philosophers.length === 0) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black text-white/50">
        <p>Loading...</p>
      </div>
    );
  }

  const selectedPhilosopher = selectedId
    ? philosophers.find((p) => p.id === selectedId)
    : null;

  if (selectedPhilosopher) {
    return (
      <div className="app">
        <main className="main">
          <Chat
            philosopher={selectedPhilosopher}
            onBack={() => setSelectedId(null)}
          />
        </main>
      </div>
    );
  }

  const timelineData = buildTimelineData(philosophers);

  return (
    <RadialOrbitalTimeline
      timelineData={timelineData}
      onNodeClick={(philosopherId) => setSelectedId(philosopherId)}
    />
  );
}
