import { Server, Socket } from "socket.io";
import Room from "./models/room";

export async function handleGameConnections(socket: Socket, io: Server) {
  // Join a game room
  socket.on("join_game", async (data) => {
    const { roomId, playerName } = data;
    const playerSocketId = socket.id; // Player's socket ID

    try {
      let room = await Room.findOne({ roomId });

      if (!room) {
        // Create a new room and assign player A
        room = new Room({
          roomId,
          playerA: { name: playerName, socketId: playerSocketId },
        });
        await room.save();
        console.log(
          `Player A (${playerName}, ${playerSocketId}) joined room ${roomId}`
        );
      } else if (!room.playerB) {
        // Assign player B
        room.playerB = { name: playerName, socketId: playerSocketId };
        await room.save();
        console.log(
          `Player B (${playerName}, ${playerSocketId}) joined room ${roomId}`
        );
      } else {
        socket.emit("room_full", { message: "Room is already full" });
        return;
      }

      // Add the player to the room
      socket.join(roomId);
      io.to(roomId).emit("player_joined", {
        playerId: playerSocketId,
        playerName,
      });
    } catch (error) {
      console.error("Error joining game:", error);
      socket.emit("error", { message: "Failed to join the game." });
    }
  });

  // Handle player moves
  socket.on("playerMove", async (data) => {
    const { roomId, player, index } = data;

    try {
      const room = await Room.findOne({ roomId });



      if (room) {
        const opponent =
          room.playerA?.name === player ? room.playerB : room.playerA;

          console.log(opponent);

        if (opponent) {
          io.to(opponent.socketId).emit("move_made", { player, index });
          console.log(
            `Player ${player} made a move in room ${roomId} at index ${index}`
          );
        } else {
          console.log(`Move made by ${player}, but no opponent to notify.`);
        }
      } else {
        console.log(`Room ${roomId} does not exist.`);
      }
    } catch (error) {
      console.error("Error handling player move:", error);
      socket.emit("error", { message: "Failed to process the move." });
    }
  });

  // Handle disconnect
  socket.on("disconnect", async () => {
    try {
      const room = await Room.findOne({
        $or: [
          { "playerA.socketId": socket.id },
          { "playerB.socketId": socket.id },
        ],
      });

      if (room) {
        if (room.playerA?.socketId === socket.id) {
          room.playerA = null;
        } else if (room.playerB?.socketId === socket.id) {
          room.playerB = null;
        }

        // Delete room if both players are gone
        if (!room.playerA && !room.playerB) {
          await Room.deleteOne({ _id: room._id });
          console.log(`Room ${room.roomId} has been removed.`);
        } else {
          await room.save();
          console.log(`Player disconnected from room ${room.roomId}`);
        }

        // Notify the remaining player in the room
        const remainingPlayer = room.playerA || room.playerB; // Only one player will be left
        if (remainingPlayer) {
          io.to(remainingPlayer.socketId).emit("opponent_disconnected", {
            message: "Your opponent has disconnected.",
          });
        }
      }
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  });
}