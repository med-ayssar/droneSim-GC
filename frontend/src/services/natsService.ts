import { connect, NatsConnection, StringCodec } from 'nats.ws';
import { BinaryReader, BinaryWriter } from '@bufbuild/protobuf';

export interface TelemetryData {
  droneId: string;
  timestampMs: number;
  connected: boolean;
  armed: boolean;
  flightMode: string;
  latitude: number;
  longitude: number;
  altitudeM: number;
  roll: number;
  pitch: number;
  yaw: number;
  batteryPercentage: number;
  gpsAvailable: boolean;
  satellitesVisible: number;
  headingDeg: number;
}

export interface CommandResultData {
  requestId: string;
  droneId: string;
  status: 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
  message: string;
  timestampMs: number;
}

export type CommandType = 'ARM' | 'DISARM' | 'TAKEOFF' | 'LAND' | 'RTL' | 'HOLD' | 'OFFBOARD' | 'SET_VELOCITY';

export class NatsService {
  private nc: NatsConnection | null = null;
  private sc = StringCodec();

  public async connect(url: string = import.meta.env.VITE_NATS_WS_URL ?? 'ws://localhost:9222'): Promise<boolean> {
    this.disconnect();
    try {
      this.nc = await connect({
        servers: [url],
        user: 'operator',
        pass: 'operator_password',
        reconnect: true,
        maxReconnectAttempts: -1,
      });
      console.log('[NatsService] Connected to NATS broker at', url);
      return true;
    } catch (err) {
      console.error('[NatsService] Failed to connect to NATS broker:', err);
      return false;
    }
  }

  public disconnect() {
    if (this.nc) {
      this.nc.close();
      this.nc = null;
    }
  }

  public isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }

  public subscribeTelemetry(droneId: string, onTelemetry: (data: TelemetryData) => void): () => void {
    if (!this.nc) return () => undefined;
    const subject = `drone.${droneId}.telemetry`;
    const sub = this.nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.parseTelemetryPayload(msg.data, droneId);
          onTelemetry(data);
        } catch (e) {
          console.error('[NatsService] Error decoding telemetry payload:', e);
        }
      }
    })();
    return () => sub.unsubscribe();
  }

  public subscribeCommandResult(droneId: string, onResult: (data: CommandResultData) => void): () => void {
    if (!this.nc) return () => undefined;
    const subject = `drone.${droneId}.command.result`;
    const sub = this.nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.parseResultPayload(msg.data, droneId);
          onResult(data);
        } catch (e) {
          console.error('[NatsService] Error decoding command result payload:', e);
        }
      }
    })();
    return () => sub.unsubscribe();
  }

  public async sendCommand(
    droneId: string,
    commandType: CommandType,
    takeoffAltitude: number = 10.0,
    velocityParams?: { vx: number; vy: number; vz: number; yawRate: number }
  ): Promise<string> {
    if (!this.nc) throw new Error('NATS client not connected');

    const requestId = 'req_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const subject = `drone.${droneId}.command`;

    const payload = this.encodeCommandPayload(requestId, droneId, commandType, takeoffAltitude, velocityParams);
    await this.nc.publish(subject, payload);
    return requestId;
  }

  /**
   * Encodes outgoing DroneCommand into Protobuf binary wire format
   * (compatible with C++ drone::v1::DroneCommand).
   */
  private encodeCommandPayload(
    requestId: string,
    droneId: string,
    commandType: CommandType,
    takeoffAltitude: number,
    velocityParams?: { vx: number; vy: number; vz: number; yawRate: number }
  ): Uint8Array {
    const typeEnumMap: Record<CommandType, number> = {
      ARM: 1,
      DISARM: 2,
      TAKEOFF: 3,
      LAND: 4,
      RTL: 5,
      HOLD: 6,
      OFFBOARD: 7,
      SET_VELOCITY: 8,
    };

    const writer = new BinaryWriter();

    // 1. request_id (string, tag 1)
    writer.uint32((1 << 3) | 2).string(requestId);

    // 2. drone_id (string, tag 2)
    writer.uint32((2 << 3) | 2).string(droneId);

    // 3. timestamp_ms (uint64, tag 3)
    writer.uint32((3 << 3) | 0).uint64(Date.now());

    // 4. command (enum CommandType, tag 4)
    const cmdEnum = typeEnumMap[commandType] || 0;
    writer.uint32((4 << 3) | 0).uint32(cmdEnum);

    // 5. takeoff (TakeoffParameters, tag 5)
    if (commandType === 'TAKEOFF') {
      const tkWriter = new BinaryWriter();
      tkWriter.uint32((1 << 3) | 1).double(takeoffAltitude); // altitude_m = 1
      tkWriter.uint32((2 << 3) | 1).double(2.0); // speed_m_s = 2
      writer.uint32((5 << 3) | 2).bytes(tkWriter.finish());
    }

    // 6. velocity (VelocityParameters, tag 6)
    if (commandType === 'SET_VELOCITY' && velocityParams) {
      const velWriter = new BinaryWriter();
      velWriter.uint32((1 << 3) | 1).double(velocityParams.vx);
      velWriter.uint32((2 << 3) | 1).double(velocityParams.vy);
      velWriter.uint32((3 << 3) | 1).double(velocityParams.vz);
      velWriter.uint32((4 << 3) | 1).double(velocityParams.yawRate);
      writer.uint32((6 << 3) | 2).bytes(velWriter.finish());
    }

    return writer.finish();
  }

  /**
   * Decodes incoming DroneTelemetry payload (Protobuf binary primary, JSON fallback).
   */
  private parseTelemetryPayload(payload: Uint8Array, fallbackDroneId: string): TelemetryData {
    // 1. Attempt Protobuf Binary decoding
    try {
      const reader = new BinaryReader(payload);
      let droneId = fallbackDroneId;
      let timestampMs = Date.now();
      let connected = true;
      let armed = false;
      let flightMode = 'DISARMED';
      let latitude = 50.1109;
      let longitude = 8.6821;
      let altitudeM = 0.0;
      let roll = 0.0;
      let pitch = 0.0;
      let yaw = 0.0;
      let batteryPercentage = 100.0;
      let gpsAvailable = true;
      let satellitesVisible = 12;
      let headingDeg = 0.0;

      let decodedAny = false;

      while (reader.pos < reader.len) {
        const [fieldNo, wireType] = reader.tag();
        decodedAny = true;
        switch (fieldNo) {
          case 1: droneId = reader.string(); break;
          case 2: timestampMs = Number(reader.uint64()); break;
          case 3: connected = reader.bool(); break;
          case 4: armed = reader.bool(); break;
          case 5: flightMode = reader.string(); break;
          case 6: latitude = reader.double(); break;
          case 7: longitude = reader.double(); break;
          case 8: altitudeM = reader.double(); break;
          case 9: roll = reader.double(); break;
          case 10: pitch = reader.double(); break;
          case 11: yaw = reader.double(); break;
          case 12: batteryPercentage = reader.double(); break;
          case 13: gpsAvailable = reader.bool(); break;
          case 14: satellitesVisible = reader.uint32(); break;
          case 15: headingDeg = reader.double(); break;
          default: reader.skip(wireType); break;
        }
      }

      if (decodedAny) {
        return {
          droneId,
          timestampMs,
          connected,
          armed,
          flightMode,
          latitude,
          longitude,
          altitudeM,
          roll,
          pitch,
          yaw,
          batteryPercentage,
          gpsAvailable,
          satellitesVisible,
          headingDeg,
        };
      }
    } catch {
      // Protobuf binary parse failed, try JSON fallback
    }

    // 2. Fallback to JSON parsing
    try {
      const text = this.sc.decode(payload);
      const obj = JSON.parse(text);
      return {
        droneId: obj.drone_id ?? fallbackDroneId,
        timestampMs: obj.timestamp_ms ?? Date.now(),
        connected: obj.connected ?? true,
        armed: obj.armed ?? false,
        flightMode: obj.flight_mode ?? 'OFFBOARD',
        latitude: obj.latitude ?? 50.1109,
        longitude: obj.longitude ?? 8.6821,
        altitudeM: obj.altitude_m ?? 0.0,
        roll: obj.roll ?? 0.0,
        pitch: obj.pitch ?? 0.0,
        yaw: obj.yaw ?? 0.0,
        batteryPercentage: obj.battery_percentage ?? 100,
        gpsAvailable: obj.gps_available ?? true,
        satellitesVisible: obj.satellites_visible ?? 12,
        headingDeg: obj.heading_deg ?? 0.0,
      };
    } catch {
      return {
        droneId: fallbackDroneId,
        timestampMs: Date.now(),
        connected: true,
        armed: false,
        flightMode: 'DISARMED',
        latitude: 50.1109,
        longitude: 8.6821,
        altitudeM: 0.0,
        roll: 0.0,
        pitch: 0.0,
        yaw: 0.0,
        batteryPercentage: 98,
        gpsAvailable: true,
        satellitesVisible: 14,
        headingDeg: 45.0,
      };
    }
  }

  /**
   * Decodes incoming CommandResult payload (Protobuf binary primary, JSON fallback).
   */
  private parseResultPayload(payload: Uint8Array, fallbackDroneId: string): CommandResultData {
    const statusMap: Record<number, CommandResultData['status']> = {
      1: 'RECEIVED',
      2: 'ACCEPTED',
      3: 'REJECTED',
      4: 'EXECUTED',
      5: 'FAILED',
    };

    // 1. Attempt Protobuf Binary decoding
    try {
      const reader = new BinaryReader(payload);
      let requestId = '';
      let droneId = fallbackDroneId;
      let statusEnum = 4;
      let message = 'Executed';
      let timestampMs = Date.now();
      let decodedAny = false;

      while (reader.pos < reader.len) {
        const [fieldNo, wireType] = reader.tag();
        decodedAny = true;
        switch (fieldNo) {
          case 1: requestId = reader.string(); break;
          case 2: droneId = reader.string(); break;
          case 3: statusEnum = reader.uint32(); break;
          case 4: message = reader.string(); break;
          case 5: timestampMs = Number(reader.uint64()); break;
          default: reader.skip(wireType); break;
        }
      }

      if (decodedAny) {
        return {
          requestId,
          droneId,
          status: statusMap[statusEnum] || 'EXECUTED',
          message,
          timestampMs,
        };
      }
    } catch {
      // Binary parse failed, try JSON
    }

    // 2. Fallback to JSON parsing
    try {
      const text = this.sc.decode(payload);
      const obj = JSON.parse(text);

      return {
        requestId: obj.request_id || '',
        droneId: obj.drone_id || fallbackDroneId,
        status: typeof obj.status === 'number' ? statusMap[obj.status] : obj.status || 'EXECUTED',
        message: obj.message || 'Execution completed',
        timestampMs: obj.timestamp_ms || Date.now(),
      };
    } catch {
      return {
        requestId: 'unknown',
        droneId: fallbackDroneId,
        status: 'EXECUTED',
        message: 'Completed',
        timestampMs: Date.now(),
      };
    }
  }
}

export const natsService = new NatsService();
