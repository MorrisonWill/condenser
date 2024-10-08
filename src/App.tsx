import React, { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { Captions, Download, FileAudio, FileVideo, Loader2, Plus, X, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { parse as parseSrtVtt } from '@plussub/srt-vtt-parser'
import { parse as parseAss } from 'ass-compiler'
import audioBufferToWav from 'audiobuffer-to-wav'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FileInput } from "@/components/FileInput"
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

interface FileSet {
    id: string;
    videoFile: File | null;
    subtitleFile: File | null;
    downloadUrl?: string;
}

export default function AudioExtractor() {
    const [fileSets, setFileSets] = useState<FileSet[]>([{ id: '1', videoFile: null, subtitleFile: null }])
    const [isProcessing, setIsProcessing] = useState(false)
    const [isZipping, setIsZipping] = useState(false)
    const [progress, setProgress] = useState(0)
    const [zipProgress, setZipProgress] = useState(0)

    const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
    const [showDownloadDialog, setShowDownloadDialog] = useState(false)
    const [bulkVideoFiles, setBulkVideoFiles] = useState<File[]>([])
    const [bulkSubtitleFiles, setBulkSubtitleFiles] = useState<File[]>([])


    const { toast } = useToast()

    const handleFileChange = (id: string, type: 'video' | 'subtitle') => (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0] || null
        setFileSets(prev => prev.map(set =>
            set.id === id ? { ...set, [`${type}File`]: selectedFile } : set
        ))
    }


    const addFileSet = () => {
        setFileSets(prev => [...prev, { id: Date.now().toString(), videoFile: null, subtitleFile: null }])
    }

    const removeFileSet = (id: string) => {
        setFileSets(prev => prev.filter(set => set.id !== id))
    }

    const handleBulkUpload = (type: 'video' | 'subtitle') => (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || [])
        const sortedFiles = files.sort((a, b) => {
            const numA = parseInt(a.name.match(/\d+/)?.[0] || '0')
            const numB = parseInt(b.name.match(/\d+/)?.[0] || '0')
            return numA - numB
        })

        if (type === 'video') {
            setBulkVideoFiles(sortedFiles)
        } else {
            setBulkSubtitleFiles(sortedFiles)
        }
    }

    const applyBulkUpload = () => {
        if (bulkVideoFiles.length === 0 || bulkSubtitleFiles.length === 0 || bulkSubtitleFiles.length !== bulkVideoFiles.length) {
            toast({
                title: "Incomplete selection",
                description: "Please select both video and subtitle files for bulk upload.",
                variant: "destructive",
            })
            return
        }

        const newFileSets = bulkVideoFiles.map((videoFile, index) => ({
            id: Date.now().toString() + index,
            videoFile,
            subtitleFile: bulkSubtitleFiles[index] || null,
        }))

        setFileSets(newFileSets)
        setBulkUploadOpen(false)
        setBulkVideoFiles([])
        setBulkSubtitleFiles([])
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

        const mergedPeriods: Array<{ start: number; end: number }> = []

        periods.sort((a, b) => a.start - b.start)

        for (let i = 0; i < periods.length; i++) {
            const first = periods[i]
            const second = periods[i+1]
            if ((first.end + 3) >= second.start) {
                // merge them
                mergedPeriods.push({
                    start: first.start,
                    end: second.end
                })
            }
        }

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

            if (updatedFileSets.length > 1) {
                setShowDownloadDialog(true)
            }

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

    const handleZipDownload = async () => {
        const zip = new JSZip()

        setZipProgress(0)
        setIsZipping(true)

        for (let i = 0; i < fileSets.length; i++) {
            const fileSet = fileSets[i]
            if (fileSet.downloadUrl) {
                const response = await fetch(fileSet.downloadUrl)
                const blob = await response.blob()
                zip.file(`${fileSet.videoFile?.name ?? i + 1}_CONDENSED.wav`, blob)
            }
            setZipProgress((i + 0.5) / fileSets.length * 100)
        }

        const content = await zip.generateAsync({ type: "blob" })
        saveAs(content, "condensed_audio_files.zip")
        setIsZipping(false)
        setShowDownloadDialog(false)
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
                                    <li>Upload video files (TV show episodes, anime episodes, etc.) individually or in bulk</li>
                                    <li>Upload the corresponding subtitle files individually or in bulk</li>
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
                                        <Label htmlFor={`video-upload-${fileSet.id}`} className="mb-2 block">Video
                                            File</Label>
                                        <div className="flex items-center space-x-2">
                                            <FileInput
                                                id={`video-upload-${fileSet.id}`}
                                                accept="video/*"
                                                onChange={handleFileChange(fileSet.id, 'video')}
                                                className="flex-grow"
                                                value={fileSet.videoFile?.name}
                                            />
                                            <FileVideo className="text-muted-foreground"/>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor={`subtitle-upload-${fileSet.id}`} className="mb-2 block">Subtitle
                                            File</Label>
                                        <div className="flex items-center space-x-2">
                                            <FileInput
                                                id={`subtitle-upload-${fileSet.id}`}
                                                accept=".srt,.vtt,.ass"
                                                onChange={handleFileChange(fileSet.id, 'subtitle')}
                                                className="flex-grow"
                                                value={fileSet.subtitleFile?.name}
                                            />
                                            <Captions className="text-muted-foreground"/>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    {fileSet.downloadUrl && !isProcessing && (
                                        <Button asChild variant="outline" className="w-full">
                                            <a href={fileSet.downloadUrl}
                                               download={`${fileSet.videoFile?.name ?? index + 1}_CONDENSED.wav`}>
                                                <Download className="mr-2 h-4 w-4"/>
                                                Download Audio
                                            </a>
                                        </Button>
                                    )}
                                </CardFooter>
                                <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Download Options</DialogTitle>
                                        </DialogHeader>
                                        <p>You have processed multiple files. Would you like to download them all as a zip file?</p>
                                        <div className="flex justify-end space-x-2 mt-4">
                                            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
                                                Cancel
                                            </Button>
                                            <Button onClick={handleZipDownload}>
                                                Download Zip
                                            </Button>
                                        </div>
                                        {isZipping && (
                                            <div className="mt-6">
                                                <Progress value={zipProgress} className="w-full"/>
                                                <p className="text-sm text-muted-foreground mt-2 text-center">Creating zip file...</p>
                                            </div>
                                        )}
                                    </DialogContent>
                                </Dialog>

                            </Card>
                        ))}

                        <div className="flex space-x-4">
                            <Button type="button" onClick={addFileSet} variant="outline" className="flex-1">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Another Episode
                            </Button>
                            <Dialog open={bulkUploadOpen} onOpenChange={setBulkUploadOpen}>
                                <DialogTrigger asChild>
                                    <Button type="button" variant="outline" className="flex-1">
                                        <Upload className="w-4 h-4 mr-2" />
                                        Bulk Upload
                                    </Button>
                                </DialogTrigger>
                                <DialogContent aria-describedby={undefined}>
                                    <DialogHeader>
                                        <DialogTitle>Bulk Upload</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 mt-4">
                                        <div>
                                            <Label htmlFor="bulk-video-upload" className="mb-2 block">Bulk Video Upload</Label>
                                            <Input
                                                id="bulk-video-upload"
                                                type="file"
                                                accept="video/*"
                                                onChange={handleBulkUpload('video')}
                                                multiple
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="bulk-subtitle-upload" className="mb-2 block">Bulk Subtitle Upload</Label>
                                            <Input
                                                id="bulk-subtitle-upload"
                                                type="file"
                                                accept=".srt,.vtt,.ass"
                                                onChange={handleBulkUpload('subtitle')}
                                                multiple
                                            />
                                        </div>
                                        <Button onClick={applyBulkUpload} className="w-full">
                                            Apply Bulk Upload
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
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
                        <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2">
                            <title>GitHub</title>
                            <path
                                d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                                fill="currentColor"/>
                        </svg>
                        View source on GitHub
                    </a>
                </CardFooter>
            </Card>
        </div>
    )
}