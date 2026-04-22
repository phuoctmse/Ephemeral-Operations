-- CreateEnum
CREATE TYPE "EnvStatus" AS ENUM ('CREATING', 'RUNNING', 'DESTROYED', 'FAILED');

-- CreateTable
CREATE TABLE "SandboxEnv" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "resourceId" TEXT,
    "instanceType" TEXT NOT NULL,
    "status" "EnvStatus" NOT NULL DEFAULT 'CREATING',
    "hourlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "costIncurred" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxEnv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,
    "agentReasoning" TEXT NOT NULL,
    "toolCalled" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SandboxEnv_resourceId_key" ON "SandboxEnv"("resourceId");

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_envId_fkey" FOREIGN KEY ("envId") REFERENCES "SandboxEnv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
