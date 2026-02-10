import Image from "next/image";
import { LucideProps } from "lucide-react";

export const Icons = {
    python: (props: LucideProps) => (
        <Image src="/python.svg" alt="Python" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    java: (props: LucideProps) => (
        <Image src="/java.svg" alt="Java" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    cplusplus: (props: LucideProps) => (
        <Image src="/cplusplus.svg" alt="C++" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    typescript: (props: LucideProps) => (
        <Image src="/typescript.svg" alt="TypeScript" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    postgresql: (props: LucideProps) => (
        <Image src="/postgresql.svg" alt="PostgreSQL" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    react: (props: LucideProps) => (
        <Image src="/react.svg" alt="React" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    nodejs: (props: LucideProps) => (
        <Image src="/nodejs.svg" alt="Node.js" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    flask: (props: LucideProps) => (
        <Image src="/flask.svg" alt="Flask" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    fastapi: (props: LucideProps) => (
        <Image src="/fastapi.svg" alt="FastAPI" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    pytorch: (props: LucideProps) => (
        <Image src="/pytorch.svg" alt="PyTorch" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    docker: (props: LucideProps) => (
        <Image src="/docker.svg" alt="Docker" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    git: (props: LucideProps) => (
        <Image src="/git.svg" alt="Git" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
    googlecloud: (props: LucideProps) => (
        <Image src="/googlecloud.svg" alt="GCP" width={24} height={24} className={`dark:invert ${props.className}`} />
    ),
};
