import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole, RtmTokenBuilder } from 'agora-token';

const EXPIRATION_TIME_IN_SECONDS = 3600;

function generateChannelName(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ai-conversation-${timestamp}-${random}`;
}

export async function GET(request: NextRequest) {
  const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.NEXT_AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    console.error('[/api/generate-agora-token] Error: Agora credentials are not configured. NEXT_PUBLIC_AGORA_APP_ID present:', Boolean(APP_ID), 'NEXT_AGORA_APP_CERTIFICATE present:', Boolean(APP_CERTIFICATE));
    return NextResponse.json(
      { error: 'Agora credentials are not set' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const uidStr = searchParams.get('uid');
  const parsedUid = uidStr ? parseInt(uidStr, 10) : Number.NaN;
  const uid = Number.isNaN(parsedUid) || parsedUid <= 0
    ? Math.floor(Math.random() * 9_999_000) + 1000
    : parsedUid;
  const channelName = searchParams.get('channel') || generateChannelName();

  try {
    const token = RtcTokenBuilder.buildTokenWithRtm(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid.toString(),
      RtcRole.PUBLISHER,
      EXPIRATION_TIME_IN_SECONDS,
      EXPIRATION_TIME_IN_SECONDS,
    );

    let rtmToken = token;
    try {
      rtmToken = RtmTokenBuilder.buildToken(
        APP_ID,
        APP_CERTIFICATE,
        uid.toString(),
        EXPIRATION_TIME_IN_SECONDS,
      );
    } catch (rtmTokenErr) {
      console.warn('[/api/generate-agora-token] RtmTokenBuilder warning (falling back to RTC+RTM unified token):', rtmTokenErr instanceof Error ? rtmTokenErr.message : String(rtmTokenErr));
    }

    return NextResponse.json({
      token,
      rtcToken: token,
      rtmToken,
      uid: uid.toString(),
      channel: channelName,
    });
  } catch (error) {
    console.error('[/api/generate-agora-token] Error generating Agora token for channel:', channelName, 'uid:', uid, error);
    return NextResponse.json(
      {
        error: 'Failed to generate Agora token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
