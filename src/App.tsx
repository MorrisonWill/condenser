import React, {useCallback, useState} from "react"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Progress} from "@/components/ui/progress"
import {Label} from "@/components/ui/label"
import {Captions, Download, FileAudio, FileVideo, Github, Loader2, Plus, X} from "lucide-react"
import {useToast} from "@/hooks/use-toast"
import {parse as parseSrtVtt} from '@plussub/srt-vtt-parser'
import {parse as parseAss} from 'ass-compiler'
import audioBufferToWav from 'audiobuffer-to-wav'
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card"
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion"

interface FileSet {
    id: string;
    videoFile: File | null;
    subtitleFile: File | null;
    downloadUrl?: string;
}

export default function AudioExtractor() {
    const [fileSets, setFileSets] = useState<FileSet[]>([{ id: '1', videoFile: null, subtitleFile: null }])
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)

    const { toast } = useToast()

    const handleFileChange = (id: string, type: 'video' | 'subtitle') => (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0]
        setFileSets(prev => prev.map(set =>
            set.id === id ? { ...set, [`${type}File`]: selectedFile || null } : set
        ))
    }

    const addFileSet = () => {
        setFileSets(prev => [...prev, { id: Date.now().toString(), videoFile: null, subtitleFile: null }])
    }

    const removeFileSet = (id: string) => {
        setFileSets(prev => prev.filter(set => set.id !== id))
    }

    const parseSubtitles = async (file: File): Promise<Array<{ start: number; end: number }>> => {
        const text = await file.text()
        const fileExtension = file.name.split('.').pop()?.toLowerCase()

        let periods: Array<{ start: number; end: number }>

        if (fileExtension === 'ass') {
            const parsed = parseAss(text)
            periods = parsed.events.dialogue.map(dialogue => ({
                start: dialogue.Start,
                end: dialogue.End
            }))
        } else {
            const { entries } = parseSrtVtt(text)
            periods = entries.map(item => ({
                start: item.from / 1000,
                end: item.to / 1000
            }))
        }

        const padding = 0.5
        periods = periods.map(period => ({
            start: Math.max(0, period.start - padding),
            end: period.end + padding
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
        if (fileSets.some(set => !set.videoFile || !set.subtitleFile)) return

        setIsProcessing(true)
        setProgress(0)

        try {
            const updatedFileSets = [...fileSets]

            for (let i = 0; i < updatedFileSets.length; i++) {
                const { videoFile, subtitleFile } = updatedFileSets[i]
                if (!videoFile || !subtitleFile) continue

                const subtitles = await parseSubtitles(subtitleFile)
                setProgress((i + 0.5) / updatedFileSets.length * 100)

                const audioBlob = await extractAudio(videoFile, subtitles)
                updatedFileSets[i].downloadUrl = URL.createObjectURL(audioBlob)
                setProgress((i + 1) / updatedFileSets.length * 100)
            }

            setFileSets(updatedFileSets)

            toast({
                title: "Audio extracted successfully",
                description: "Your condensed audio files are ready for download.",
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
        <div className="max-w-3xl mx-auto my-10 p-6 bg-background">
            <Card>
                <CardHeader>
                    <CardTitle className="text-3xl font-bold text-center">Condensed Audio Maker</CardTitle>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible className="mb-6">
                        <AccordionItem value="how-it-works">
                            <AccordionTrigger>How it works</AccordionTrigger>
                            <AccordionContent>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                                    <li>Upload video files (TV show episodes, anime episodes, etc.)</li>
                                    <li>Upload the corresponding subtitle files</li>
                                    <li>Our system extracts only the spoken dialogue based on the subtitles</li>
                                    <li>Download the condensed audio files for each episode</li>
                                </ol>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {fileSets.map((fileSet, index) => (
                            <Card key={fileSet.id} className="relative">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xl flex justify-between items-center">
                                        Episode {index + 1}
                                        {fileSets.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-auto p-1 text-muted-foreground hover:text-foreground"
                                                onClick={() => removeFileSet(fileSet.id)}
                                            >
                                                <X className="w-4 h-4" />
                                                <span className="sr-only">Remove Episode</span>
                                            </Button>
                                        )}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor={`video-upload-${fileSet.id}`} className="mb-2 block">Video File</Label>
                                        <div className="flex items-center space-x-2">
                                            <Input
                                                id={`video-upload-${fileSet.id}`}
                                                type="file"
                                                accept="video/*"
                                                onChange={handleFileChange(fileSet.id, 'video')}
                                                className="flex-grow"
                                                required
                                            />
                                            <FileVideo className="text-muted-foreground"/>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor={`subtitle-upload-${fileSet.id}`} className="mb-2 block">Subtitle File</Label>
                                        <div className="flex items-center space-x-2">
                                            <Input
                                                id={`subtitle-upload-${fileSet.id}`}
                                                type="file"
                                                accept=".srt,.vtt,.ass"
                                                onChange={handleFileChange(fileSet.id, 'subtitle')}
                                                className="flex-grow"
                                                required
                                            />
                                            <Captions className="text-muted-foreground"/>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    {fileSet.downloadUrl && !isProcessing && (
                                        <Button asChild variant="outline" className="w-full">
                                            <a href={fileSet.downloadUrl} download={`condensed_audio_episode_${index + 1}.wav`}>
                                                <Download className="mr-2 h-4 w-4"/>
                                                Download Audio
                                            </a>
                                        </Button>
                                    )}
                                </CardFooter>
                            </Card>
                        ))}

                        <div className="flex space-x-4">
                            <Button type="button" onClick={addFileSet} variant="outline" className="flex-1">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Another Episode
                            </Button>
                            <Button type="submit" className="flex-1" disabled={fileSets.some(set => !set.videoFile || !set.subtitleFile) || isProcessing}>
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <FileAudio className="mr-2 h-4 w-4" />
                                        Extract Audio
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>

                    {isProcessing && (
                        <div className="mt-6">
                            <Progress value={progress} className="w-full"/>
                            <p className="text-sm text-muted-foreground mt-2 text-center">Extracting and condensing audio...</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col items-center space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                        All processing is done locally. Your files are not uploaded anywhere.
                    </p>
                    <a
                        href="https://github.com/MorrisonWill/condenser"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Github className="w-4 h-4 mr-2"/>
                        View source on GitHub
                    </a>
                </CardFooter>
            </Card>
        </div>
    )
}