import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateLiveStream } from "@workspace/api-client-react";
import type { LiveStream } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Radio, ChevronLeft, Lock, Globe, Users } from "lucide-react";

const CATEGORIES = ["General", "Gaming", "Music", "Education", "Tech", "Business", "Fitness", "Just Chatting"];

const PRIVACY_OPTIONS = [
  { value: "public", label: "Public", description: "Anyone can watch", icon: Globe },
  { value: "followers", label: "Followers only", description: "Only people who follow you", icon: Users },
  { value: "private", label: "Private", description: "Only people with a direct link", icon: Lock },
] as const;

export default function LiveNew() {
  const { user } = useUser();
  const [, navigate] = useLocation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "followers" | "private">("public");
  const [chatEnabled, setChatEnabled] = useState(true);

  const { mutate: createStream, isPending } = useCreateLiveStream();

  const handleCreate = () => {
    if (!title.trim()) return;
    createStream(
      {
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.toLowerCase(),
          tags: tags.trim() || undefined,
          privacy,
          chatEnabled,
          streamerName: user?.fullName ?? user?.username ?? "Streamer",
        } as Parameters<typeof createStream>[0]["data"],
      },
      {
        onSuccess: (stream: LiveStream) => {
          navigate(`/live/stream/${stream.streamKey}/studio`);
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate("/live")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Live Hub
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Radio className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Create Live Stream</h1>
          <p className="text-sm text-gray-500">Set up your stream before going live</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Stream Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you streaming today?"
            maxLength={120}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell your audience what to expect..."
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  category === c
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tags</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="react, typescript, tutorial (comma separated)"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Privacy */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Privacy</label>
          <div className="space-y-2">
            {PRIVACY_OPTIONS.map(({ value, label, description: desc, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setPrivacy(value)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                  privacy === value
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Icon
                  className={`w-5 h-5 flex-shrink-0 ${privacy === value ? "text-indigo-600" : "text-gray-400"}`}
                />
                <div>
                  <p
                    className={`text-sm font-medium ${
                      privacy === value ? "text-indigo-700" : "text-gray-700"
                    }`}
                  >
                    {label}
                  </p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat toggle */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-700">Enable Chat</p>
            <p className="text-xs text-gray-500">Allow viewers to send messages during your stream</p>
          </div>
          <button
            onClick={() => setChatEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              chatEnabled ? "bg-indigo-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                chatEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={!title.trim() || isPending}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isPending ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Radio className="w-4 h-4" />
          )}
          {isPending ? "Creating stream..." : "Continue to Studio"}
        </button>
      </div>
    </div>
  );
}
