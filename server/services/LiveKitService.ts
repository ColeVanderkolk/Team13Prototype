import { AccessToken, TrackSource } from "livekit-server-sdk";

// Optional real-time voice chat via LiveKit Cloud. Reads credentials from env vars that
// aren't required anywhere else (LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET) - if
// they're unset, isConfigured() returns false and callers just skip voice entirely, so the
// game runs the same as before for anyone who hasn't set up a LiveKit project.
export class LiveKitService {
    private apiKey: string;
    private apiSecret: string;
    private livekitUrl: string;

    constructor() {
        this.apiKey = process.env.LIVEKIT_API_KEY || "";
        this.apiSecret = process.env.LIVEKIT_API_SECRET || "";
        this.livekitUrl = process.env.LIVEKIT_URL || "";

        if (!this.apiKey || !this.apiSecret || !this.livekitUrl) {
            console.warn("LiveKit credentials not configured. Voice chat will be disabled.");
        }
    }

    isConfigured(): boolean {
        return !!(this.apiKey && this.apiSecret && this.livekitUrl);
    }

    async generateToken(roomName: string, participantId: string, participantName: string): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error("LiveKit is not configured");
        }

        const token = new AccessToken(this.apiKey, this.apiSecret, {
            identity: participantId,
            name: participantName,
        });

        // Realtime audio only. The token deliberately grants no recording/egress
        // capability (no roomRecord) and restricts publishing to the microphone, so
        // no video/screenshare can be published and nothing can be recorded or stored.
        token.addGrant({
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishSources: [TrackSource.MICROPHONE],
            roomRecord: false,
        });

        return await token.toJwt();
    }
}
