import React, {useState, useCallback} from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { Upload, Download, Loader2, Captions } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { parse } from '@plussub/srt-vtt-parser'
import audioBufferToWav from 'audiobuffer-to-wav'

export default function AudioExtractor() {
    const [videoFile, setVideoFile] = useState<File | null>(null)
    const [subtitleFile, setSubtitleFile] = useState<File | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

    const { toast } = useToast()

    const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0]
        setVideoFile(selectedFile || null)
    }

    const handleSubtitleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0]
        setSubtitleFile(selectedFile || null)
    }

    const parseSubtitles = async (file: File): Promise<Array<{ start: number; end: number }>> => {
        const text = await file.text()
        const { entries } = parse(text)

        const padding = 0.5
        let periods = entries.map(item => ({
            start: item.from / 1000 - padding,
            end: item.to / 1000 + padding
        }))

        periods.sort((a, b) => a.start - b.start)

        const mergedPeriods: Array<{ start: number; end: number }> = []
        let currentPeriod = periods[0]

        for (let i = 1; i < periods.length; i++) {
            if (periods[i].start <= currentPeriod.end) {
                currentPeriod.end = Math.max(currentPeriod.end, periods[i].end)
            } else {
                mergedPeriods.push(currentPeriod)
                currentPeriod = periods[i]
            }
        }

        mergedPeriods.push(currentPeriod)

        return mergedPeriods
    }

    const extractAudio = useCallback(async (videoFile: File, subtitles: Array<{ start: number; end: number }>) => {
        const audioContext = new AudioContext()
        const arrayBuffer = await videoFile.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

        const totalDialogueDuration = subtitles.reduce((total, sub) => total + (sub.end - sub.start), 0)

        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            Math.ceil(totalDialogueDuration * audioBuffer.sampleRate),
            audioBuffer.sampleRate
        )

        let destinationOffset = 0

        for (const { start, end } of subtitles) {
            const duration = end - start
            const sourceBuffer = offlineContext.createBufferSource()
            sourceBuffer.buffer = audioBuffer

            sourceBuffer.connect(offlineContext.destination)
            sourceBuffer.start(destinationOffset, start, duration)

            destinationOffset += duration
        }

        const renderedBuffer = await offlineContext.startRendering()

        const wav = audioBufferToWav(renderedBuffer)
        return new Blob([wav], { type: 'audio/wav' })
    }, [])

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!videoFile || !subtitleFile) return

        setIsProcessing(true)
        setProgress(0)

        try {
            const subtitles = await parseSubtitles(subtitleFile)
            setProgress(20)

            const audioBlob = await extractAudio(videoFile, subtitles)
            setProgress(90)

            const url = URL.createObjectURL(audioBlob)
            setDownloadUrl(url)
            setProgress(100)

            toast({
                title: "Audio extracted successfully",
                description: "Your condensed audio file is ready for download.",
            })
        } catch (error) {
            console.error("Error processing audio:", error)
            toast({
                title: "Error processing audio",
                description: "An error occurred while extracting and condensing the audio. Please try again.",
                variant: "destructive",
            })
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="max-w-md mx-auto mt-10 p-6 bg-card rounded-lg shadow-lg">
            <h1 className="text-2xl font-bold mb-4 text-center">Condensed Audio Maker</h1>
            <div className="mt-6 text-sm text-muted-foreground">
                <h3 className="font-semibold mb-2">How it works:</h3>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Upload a video file (TV show, anime episode, etc.)</li>
                    <li>Upload the corresponding subtitle file</li>
                    <li>Our system extracts only the spoken dialogue based on the subtitles</li>
                    <li>Download the condensed audio file</li>
                </ol>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                    <Label htmlFor="video-upload">Choose Video File</Label>
                    <div className="flex items-center space-x-2">
                        <Input
                            id="video-upload"
                            type="file"
                            accept="video/*"
                            onChange={handleVideoFileChange}
                            className="flex-grow"
                            required
                        />
                        <Upload className="text-muted-foreground"/>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="subtitle-upload">Choose Subtitle File</Label>
                    <div className="flex items-center space-x-2">
                        <Input
                            id="subtitle-upload"
                            type="file"
                            accept=".srt,.vtt,.ass"
                            onChange={handleSubtitleFileChange}
                            className="flex-grow"
                            required
                        />
                        <Captions className="text-muted-foreground"/>
                    </div>
                </div>

                <Button type="submit" className="w-full" disabled={!videoFile || !subtitleFile || isProcessing}>
                    {isProcessing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                            Processing...
                        </>
                    ) : (
                        "Extract Audio"
                    )}
                </Button>
            </form>

            {isProcessing && (
                <div className="mt-4">
                    <Progress value={progress} className="w-full"/>
                    <p className="text-sm text-muted-foreground mt-2 text-center">Extracting and condensing audio...</p>
                </div>
            )}

            {downloadUrl && !isProcessing && (
                <div className="mt-6">
                    <h2 className="text-lg font-semibold mb-2">Your audio is ready!</h2>
                    <Button asChild className="w-full">
                        <a href={downloadUrl}
                           download={videoFile?.name.substring(0, videoFile?.name.lastIndexOf('.')) || "condensed_audio.mp3"}>
                            <Download className="mr-2 h-4 w-4"/>
                            Download MP3
                        </a>
                    </Button>
                </div>
            )}

            <p className="text-muted-foreground mb-6 text-center">
                All processing is done locally. Your files are not uploaded anywhere.
            </p>
        </div>
    )
}
